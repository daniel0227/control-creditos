import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import pg from "pg";
import { DEMO_CREDITS } from "./server/demoData.js";

const { Pool, types } = pg;

types.setTypeParser(20, function (value) {
  return Number(value);
});
types.setTypeParser(1700, function (value) {
  return Number(value);
});

const VALID_PAYMENT_STATUSES = new Set(["P", "N", "PP"]);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3001);
const databaseUrl = process.env.DATABASE_URL;
const distDir = path.join(__dirname, "dist");
const hasBuiltFrontend = fs.existsSync(path.join(distDir, "index.html"));

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function shouldUseSsl() {
  if (!databaseUrl) {
    return false;
  }

  if ((process.env.PGSSLMODE || "").toLowerCase() === "disable") {
    return false;
  }

  return process.env.NODE_ENV === "production";
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
    })
  : null;

function parsePositiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, "El campo \"" + field + "\" es invalido.");
  }
  return parsed;
}

function normalizeCreditPayload(payload) {
  const entity = typeof payload.entity === "string" ? payload.entity.trim() : "";
  const type = typeof payload.type === "string" ? payload.type.trim() : "";
  const responsible = typeof payload.responsible === "string" ? payload.responsible.trim() : "";
  const originalValue = Number(payload.originalValue);
  const rate = Number(payload.rate);

  if (!entity) {
    throw new HttpError(400, "La entidad es obligatoria.");
  }

  if (!type) {
    throw new HttpError(400, "El tipo es obligatorio.");
  }

  if (!responsible) {
    throw new HttpError(400, "El responsable es obligatorio.");
  }

  if (!Number.isFinite(originalValue) || originalValue <= 0) {
    throw new HttpError(400, "El valor original debe ser mayor a cero.");
  }

  if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
    throw new HttpError(400, "El porcentaje de interes debe estar entre 0 y 100.");
  }

  const observation = typeof payload.observation === "string" ? payload.observation.trim() : "";

  return {
    entity,
    type,
    responsible,
    originalValue: Math.round(originalValue),
    rate,
    observation,
  };
}

function normalizePaymentPayload(payload) {
  const month = Number(payload.month);
  const status = typeof payload.status === "string" ? payload.status.trim() : "";
  const date = payload.date ? String(payload.date) : null;
  const interest = Number(payload.interest);
  const abono = Number(payload.abono || 0);
  const note = typeof payload.note === "string" ? payload.note.trim() : "";

  if (!Number.isInteger(month) || month < 0 || month > 11) {
    throw new HttpError(400, "El mes del pago es invalido.");
  }

  if (!VALID_PAYMENT_STATUSES.has(status)) {
    throw new HttpError(400, "El estado del pago es invalido.");
  }

  if (date && Number.isNaN(Date.parse(date))) {
    throw new HttpError(400, "La fecha del pago es invalida.");
  }

  if (!Number.isFinite(interest) || interest < 0) {
    throw new HttpError(400, "Los intereses deben ser cero o un valor positivo.");
  }

  if (!Number.isFinite(abono) || abono < 0) {
    throw new HttpError(400, "El abono debe ser cero o un valor positivo.");
  }

  return {
    month,
    status,
    date,
    interest: Math.round(interest),
    abono: Math.round(abono),
    note,
  };
}

function requireDatabase(req, res, next) {
  if (!pool) {
    res.status(500).json({
      error: "DATABASE_URL no esta configurada. Agrega una base de datos PostgreSQL en Railway y conecta esta variable al servicio web.",
    });
    return;
  }

  next();
}

function mapCreditRows(rows) {
  const credits = new Map();

  rows.forEach(function (row) {
    if (!credits.has(row.id)) {
      credits.set(row.id, {
        id: row.id,
        entity: row.entity,
        type: row.type,
        responsible: row.responsible,
        originalValue: Number(row.original_value),
        rate: Number(row.rate),
        observation: row.observation || "",
        archivedAt: row.archived_at,
        archiveReason: row.archive_reason,
        payments: [],
      });
    }

    if (row.payment_id !== null) {
      credits.get(row.id).payments.push({
        month: row.payment_month,
        status: row.payment_status,
        date: row.payment_date,
        interest: Number(row.payment_interest),
        abono: Number(row.payment_abono),
        note: row.payment_note || "",
      });
    }
  });

  return Array.from(credits.values());
}

function toArchiveItem(credit) {
  return {
    credit: {
      id: credit.id,
      entity: credit.entity,
      type: credit.type,
      responsible: credit.responsible,
      originalValue: credit.originalValue,
      rate: credit.rate,
      payments: credit.payments,
    },
    reason: credit.archiveReason || "",
    archivedAt: credit.archivedAt,
  };
}

async function initializeDatabase() {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS credits (
      id SERIAL PRIMARY KEY,
      entity TEXT NOT NULL,
      type TEXT NOT NULL,
      responsible TEXT NOT NULL,
      original_value BIGINT NOT NULL CHECK (original_value > 0),
      rate NUMERIC(8, 2) NOT NULL CHECK (rate > 0 AND rate <= 100),
      term INTEGER NOT NULL DEFAULT 1 CHECK (term > 0),
      archived_at TIMESTAMPTZ,
      archive_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE credits
    ALTER COLUMN term SET DEFAULT 1;
  `);

  await pool.query(`
    UPDATE credits
    SET term = 1
    WHERE term IS DISTINCT FROM 1;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      credit_id INTEGER NOT NULL REFERENCES credits(id) ON DELETE CASCADE,
      month INTEGER NOT NULL CHECK (month >= 0 AND month <= 11),
      status TEXT NOT NULL CHECK (status IN ('P', 'N', 'PP')),
      date DATE,
      interest BIGINT NOT NULL DEFAULT 0 CHECK (interest >= 0),
      abono BIGINT NOT NULL DEFAULT 0 CHECK (abono >= 0),
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (credit_id, month)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_credit_id
    ON payments (credit_id);
  `);

  await pool.query(`
    ALTER TABLE credits ADD COLUMN IF NOT EXISTS observation TEXT NOT NULL DEFAULT '';
  `);
}

async function seedDemoData() {
  if (!pool || String(process.env.SEED_DEMO_DATA).toLowerCase() !== "true") {
    return;
  }

  const countResult = await pool.query("SELECT COUNT(*) AS total FROM credits;");
  if (Number(countResult.rows[0].total) > 0) {
    return;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const credit of DEMO_CREDITS) {
      const creditResult = await client.query(
        `
          INSERT INTO credits (entity, type, responsible, original_value, rate, term)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id;
        `,
        [credit.entity, credit.type, credit.responsible, credit.originalValue, credit.rate, 1]
      );

      for (const payment of credit.payments) {
        await client.query(
          `
            INSERT INTO payments (credit_id, month, status, date, interest, abono, note)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
          `,
          [
            creditResult.rows[0].id,
            payment.month,
            payment.status,
            payment.date,
            payment.interest,
            payment.abono,
            payment.note,
          ]
        );
      }
    }

    await client.query("COMMIT");
    console.log("Datos demo insertados porque SEED_DEMO_DATA=true.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function fetchCredits(options) {
  const archived = options && options.archived ? true : false;
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.entity,
        c.type,
        c.responsible,
        c.original_value,
        c.rate,
        c.observation,
        c.archived_at,
        c.archive_reason,
        p.id AS payment_id,
        p.month AS payment_month,
        p.status AS payment_status,
        p.date AS payment_date,
        p.interest AS payment_interest,
        p.abono AS payment_abono,
        p.note AS payment_note
      FROM credits c
      LEFT JOIN payments p ON p.credit_id = c.id
      WHERE ($1::boolean = true AND c.archived_at IS NOT NULL)
         OR ($1::boolean = false AND c.archived_at IS NULL)
      ORDER BY c.id ASC, p.month ASC;
    `,
    [archived]
  );

  return mapCreditRows(result.rows);
}

async function fetchCreditById(id) {
  const result = await pool.query(
    `
      SELECT
        c.id,
        c.entity,
        c.type,
        c.responsible,
        c.original_value,
        c.rate,
        c.observation,
        c.archived_at,
        c.archive_reason,
        p.id AS payment_id,
        p.month AS payment_month,
        p.status AS payment_status,
        p.date AS payment_date,
        p.interest AS payment_interest,
        p.abono AS payment_abono,
        p.note AS payment_note
      FROM credits c
      LEFT JOIN payments p ON p.credit_id = c.id
      WHERE c.id = $1
      ORDER BY p.month ASC;
    `,
    [id]
  );

  const credits = mapCreditRows(result.rows);
  return credits[0] || null;
}

async function ensureActiveCredit(id) {
  const credit = await fetchCreditById(id);

  if (!credit) {
    throw new HttpError(404, "Credito no encontrado.");
  }

  if (credit.archivedAt) {
    throw new HttpError(400, "El credito esta archivado y no puede modificarse.");
  }

  return credit;
}

function sanitizeCredit(credit) {
  return {
    id: credit.id,
    entity: credit.entity,
    type: credit.type,
    responsible: credit.responsible,
    originalValue: credit.originalValue,
    rate: credit.rate,
    observation: credit.observation || "",
    payments: credit.payments,
  };
}

app.use(express.json());

app.get("/api/health", requireDatabase, async function (req, res) {
  try {
    await pool.query("SELECT 1;");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "No fue posible validar la conexion a PostgreSQL." });
  }
});

app.get("/api/dashboard", requireDatabase, async function (req, res) {
  try {
    const credits = await fetchCredits({ archived: false });
    const archivedCredits = await fetchCredits({ archived: true });

    res.json({
      credits: credits.map(sanitizeCredit),
      archived: archivedCredits.map(toArchiveItem),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "No fue posible cargar los creditos desde la base de datos." });
  }
});

app.post("/api/credits", requireDatabase, async function (req, res) {
  try {
    const payload = normalizeCreditPayload(req.body);
    const result = await pool.query(
      `
        INSERT INTO credits (entity, type, responsible, original_value, rate, term, observation)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `,
      [payload.entity, payload.type, payload.responsible, payload.originalValue, payload.rate, 1, payload.observation]
    );

    const credit = await fetchCreditById(result.rows[0].id);
    res.status(201).json(sanitizeCredit(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible crear el credito." : error.message });
  }
});

app.put("/api/credits/:id", requireDatabase, async function (req, res) {
  try {
    const id = parsePositiveInteger(req.params.id, "id");
    await ensureActiveCredit(id);
    const payload = normalizeCreditPayload(req.body);

    await pool.query(
      `
        UPDATE credits
        SET
          entity = $2,
          type = $3,
          responsible = $4,
          original_value = $5,
          rate = $6,
          term = $7,
          observation = $8,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [id, payload.entity, payload.type, payload.responsible, payload.originalValue, payload.rate, 1, payload.observation]
    );

    const credit = await fetchCreditById(id);
    res.json(sanitizeCredit(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible actualizar el credito." : error.message });
  }
});

app.put("/api/credits/:id/payments/:month", requireDatabase, async function (req, res) {
  try {
    const id = parsePositiveInteger(req.params.id, "id");
    await ensureActiveCredit(id);
    const payload = normalizePaymentPayload({
      ...req.body,
      month: req.params.month,
    });

    await pool.query(
      `
        INSERT INTO payments (credit_id, month, status, date, interest, abono, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (credit_id, month)
        DO UPDATE SET
          status = EXCLUDED.status,
          date = EXCLUDED.date,
          interest = EXCLUDED.interest,
          abono = EXCLUDED.abono,
          note = EXCLUDED.note,
          updated_at = NOW();
      `,
      [id, payload.month, payload.status, payload.date, payload.interest, payload.abono, payload.note]
    );

    const credit = await fetchCreditById(id);
    res.json(sanitizeCredit(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible registrar el pago." : error.message });
  }
});

app.delete("/api/credits/:id/payments/:month", requireDatabase, async function (req, res) {
  try {
    const id = parsePositiveInteger(req.params.id, "id");
    await ensureActiveCredit(id);
    const month = Number(req.params.month);

    if (!Number.isInteger(month) || month < 0 || month > 11) {
      throw new HttpError(400, "El mes del pago es invalido.");
    }

    const result = await pool.query(
      `DELETE FROM payments WHERE credit_id = $1 AND month = $2 RETURNING id;`,
      [id, month]
    );

    if (result.rowCount === 0) {
      throw new HttpError(404, "Pago no encontrado.");
    }

    const credit = await fetchCreditById(id);
    res.json(sanitizeCredit(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible eliminar el pago." : error.message });
  }
});

app.post("/api/credits/:id/archive", requireDatabase, async function (req, res) {
  try {
    const id = parsePositiveInteger(req.params.id, "id");
    await ensureActiveCredit(id);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";

    if (!reason) {
      throw new HttpError(400, "Debes indicar el motivo de eliminacion.");
    }

    await pool.query(
      `
        UPDATE credits
        SET
          archived_at = NOW(),
          archive_reason = $2,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [id, reason]
    );

    const credit = await fetchCreditById(id);
    res.json(toArchiveItem(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible archivar el credito." : error.message });
  }
});

app.post("/api/credits/:id/restore", requireDatabase, async function (req, res) {
  try {
    const id = parsePositiveInteger(req.params.id, "id");
    const archivedCredit = await fetchCreditById(id);

    if (!archivedCredit) {
      throw new HttpError(404, "Credito no encontrado.");
    }

    if (!archivedCredit.archivedAt) {
      throw new HttpError(400, "El credito ya esta activo.");
    }

    await pool.query(
      `
        UPDATE credits
        SET
          archived_at = NULL,
          archive_reason = NULL,
          updated_at = NOW()
        WHERE id = $1;
      `,
      [id]
    );

    const credit = await fetchCreditById(id);
    res.json(sanitizeCredit(credit));
  } catch (error) {
    const status = error.status || 500;
    console.error(error);
    res.status(status).json({ error: status === 500 ? "No fue posible restaurar el credito." : error.message });
  }
});

if (hasBuiltFrontend) {
  app.use(express.static(distDir));

  app.get("/{*path}", function (req, res) {
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", function (req, res) {
    res.type("text/plain");
    res.send("API lista. Ejecuta \"npm run dev\" en otra terminal para el frontend de Vite.");
  });
}

async function start() {
  try {
    await initializeDatabase();
    await seedDemoData();

    app.listen(port, function () {
      console.log("Servidor listo en http://localhost:" + port);
      if (!databaseUrl) {
        console.warn("DATABASE_URL no esta configurada. Las rutas /api responderan con error hasta que conectes PostgreSQL.");
      }
    });
  } catch (error) {
    console.error("No fue posible iniciar el servidor:", error);
    process.exit(1);
  }
}

start();
