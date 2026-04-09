# Control de Creditos

Aplicacion full-stack para administrar creditos con React en el frontend y un backend Node/Express conectado a PostgreSQL.

## Que pasaba antes

El proyecto original era solo un frontend Vite. Los creditos salian de un arreglo fijo dentro de [`src/App.jsx`](./src/App.jsx), por eso al recargar la pagina todo volvia a los datos demo.

## Que cambio

- El frontend ahora carga y guarda informacion por API.
- Se agrego un servidor Express en [`server.js`](./server.js).
- Los datos se guardan en PostgreSQL usando `DATABASE_URL`.
- El servidor crea las tablas automaticamente al iniciar.
- Los datos demo ahora son opcionales y solo se insertan si `SEED_DEMO_DATA=true`.

## Variables de entorno

Usa `.env.example` como referencia:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/control_creditos
PORT=3001
SEED_DEMO_DATA=false
```

## Desarrollo local

1. Instala dependencias:

```bash
npm install
```

2. Levanta el backend:

```bash
npm run dev:server
```

3. En otra terminal levanta el frontend:

```bash
npm run dev
```

Vite redirige `/api` al backend local en `http://127.0.0.1:3001`.

## Railway

1. Crea un servicio PostgreSQL dentro del mismo proyecto en Railway.
2. Conecta la variable `DATABASE_URL` del servicio web al `DATABASE_URL` del servicio PostgreSQL.
3. Usa estos comandos en el servicio web:

```txt
Build Command: npm run build
Start Command: npm start
```

4. Despliega nuevamente.

## Seed opcional

Si quieres cargar una sola vez los datos demo actuales:

1. Pon `SEED_DEMO_DATA=true`.
2. Despliega.
3. Verifica que los datos quedaron en la base.
4. Vuelve a dejar `SEED_DEMO_DATA=false` para evitar siembras futuras.

## API principal

- `GET /api/dashboard`
- `POST /api/credits`
- `PUT /api/credits/:id`
- `PUT /api/credits/:id/payments/:month`
- `POST /api/credits/:id/archive`
- `POST /api/credits/:id/restore`
- `GET /api/health`
