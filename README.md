# Carrito Web separado en Backend y Frontend

Este proyecto ahora está dividido en dos carpetas principales:

- `backend/` - API Node.js con Express y MySQL.
- `frontend/` - aplicación Vue 3 con Vite.
- `backend/legacy/` - código antiguo en Python/FastAPI que se preserva como referencia.

## 1. Requisitos previos
- Node.js 20+ instalado.
- MySQL funcionando localmente.

## 2. Ejecutar el backend

1. Abre un terminal en `backend/`:

    ```bash
    cd backend
    npm install
    npm start
    ```

2. El backend escuchará por defecto en `http://127.0.0.1:3000`.

## 3. Ejecutar el frontend

1. Abre otro terminal en `frontend/`:

    ```bash
    cd frontend
    npm install
    npm run dev
    ```

2. Abre la URL que muestre Vite, normalmente `http://127.0.0.1:5173`.

## 4. Estructura del proyecto

- `backend/server.js` - API principal de Express.
- `backend/package.json` - dependencias y scripts del backend.
- `backend/database.sql` - esquema de la base de datos preservado.
- `frontend/src/App.vue` - interfaz principal de Vue.
- `frontend/package.json` - dependencias y scripts del frontend.
- `frontend/legacy/` - frontend antiguo (`index.html`, `script.js`) guardado como legado.

## 5. Endpoints disponibles
- `GET /productos`
- `GET /carrito`
- `POST /registro`
- `POST /login`
- `GET /usuario`
- `POST /usuario/cargar`
- `POST /carrito/agregar`
- `DELETE /carrito/eliminar/{id}`
- `POST /carrito/vaciar`
- `POST /carrito/finalizar`

## 6. Notas
- El backend permite CORS desde cualquier origen para desarrollo.
- El frontend Vue ya está configurado para usar el backend local en `http://127.0.0.1:3000`.
- El código anterior en Python/FastAPI quedó en `backend/legacy/` como referencia.
