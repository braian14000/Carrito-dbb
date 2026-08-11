¬from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import mysql.connector
from mysql.connector import Error

DB_CONFIG = {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "",
    "database": "carrito_db",
}

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def initialize_database():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS productos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nombre VARCHAR(100) NOT NULL,
                precio DECIMAL(10,2) NOT NULL,
                stock INT NOT NULL,
                imagen VARCHAR(255) DEFAULT NULL
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS carrito (
                id INT AUTO_INCREMENT PRIMARY KEY,
                id_producto INT NOT NULL,
                cantidad INT NOT NULL,
                FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS usuario (
                id INT PRIMARY KEY,
                saldo DECIMAL(10,2) NOT NULL DEFAULT 0,
                cargado_inicial BOOLEAN NOT NULL DEFAULT FALSE
            )
            """
        )
        cursor.execute(
            """
            INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES
            (1, 'Camiseta', 299.99, 10, NULL),
            (2, 'Pantalón', 599.99, 8, NULL),
            (3, 'Zapatillas', 1299.99, 5, NULL),
            (4, 'Gorra', 149.99, 12, NULL)
            ON DUPLICATE KEY UPDATE
                nombre = VALUES(nombre),
                precio = VALUES(precio),
                stock = VALUES(stock),
                imagen = VALUES(imagen)
            """
        )
        cursor.execute(
            """
            INSERT INTO usuario (id, saldo, cargado_inicial) VALUES (1, 0, FALSE)
            ON DUPLICATE KEY UPDATE saldo = VALUES(saldo), cargado_inicial = VALUES(cargado_inicial)
            """
        )
        cursor.execute("DELETE FROM carrito")
        conn.commit()
    except Error as exc:
        raise HTTPException(status_code=500, detail=f"No se pudo inicializar la base de datos: {exc}")
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


initialize_database()


class CarritoAgregar(BaseModel):
    id_producto: int
    cantidad: int

class SaldoCarga(BaseModel):
    monto: float


def get_connection():
    return mysql.connector.connect(**DB_CONFIG)


@app.get("/productos")
def listar_productos():
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT id, nombre, precio, stock, imagen FROM productos ORDER BY id"
        )
        productos = cursor.fetchall()
        return productos
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.get("/carrito")
def listar_carrito():
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT c.id, c.id_producto, p.nombre, p.precio, c.cantidad,
                   (p.precio * c.cantidad) AS subtotal
            FROM carrito c
            INNER JOIN productos p ON c.id_producto = p.id
            ORDER BY c.id
            """
        )
        carrito = cursor.fetchall()
        return carrito
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.get("/usuario")
def obtener_usuario():
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, saldo, cargado_inicial FROM usuario WHERE id = 1")
        usuario = cursor.fetchone()
        if not usuario:
            raise HTTPException(status_code=500, detail="Usuario no configurado.")
        return usuario
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.post("/usuario/cargar")
def cargar_saldo(saldo: SaldoCarga):
    if saldo.monto <= 0:
        raise HTTPException(status_code=400, detail="El monto debe ser mayor que cero.")
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, saldo, cargado_inicial FROM usuario WHERE id = 1")
        usuario = cursor.fetchone()
        if not usuario:
            raise HTTPException(status_code=500, detail="Usuario no configurado.")
        if usuario["cargado_inicial"]:
            raise HTTPException(status_code=400, detail="El saldo ya fue cargado y no se puede cargar nuevamente.")
        cursor.execute(
            "UPDATE usuario SET saldo = %s, cargado_inicial = TRUE WHERE id = 1",
            (saldo.monto,),
        )
        conn.commit()
        return {"message": "Saldo inicial cargado correctamente.", "saldo": saldo.monto}
    except HTTPException:
        raise
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.post("/carrito/agregar")
def agregar_al_carrito(item: CarritoAgregar):
    if item.cantidad <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor que cero.")
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT id, stock FROM productos WHERE id = %s", (item.id_producto,))
        producto = cursor.fetchone()
        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado.")

        cursor.execute(
            "SELECT id, cantidad FROM carrito WHERE id_producto = %s",
            (item.id_producto,),
        )
        existente = cursor.fetchone()
        nueva_cantidad = item.cantidad
        if existente:
            nueva_cantidad += existente["cantidad"]

        if producto["stock"] < nueva_cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente. Disponible: {producto['stock']}",
            )

        if existente:
            cursor.execute(
                "UPDATE carrito SET cantidad = %s WHERE id = %s",
                (nueva_cantidad, existente["id"]),
            )
        else:
            cursor.execute(
                "INSERT INTO carrito (id_producto, cantidad) VALUES (%s, %s)",
                (item.id_producto, item.cantidad),
            )
        conn.commit()
        return {"message": "Producto agregado al carrito."}
    except HTTPException:
        raise
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.delete("/carrito/eliminar/{id}")
def eliminar_del_carrito(id: int):
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM carrito WHERE id = %s", (id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Artículo del carrito no encontrado.")
        conn.commit()
        return {"message": "Producto eliminado del carrito."}
    except HTTPException:
        raise
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.post("/carrito/vaciar")
def vaciar_carrito():
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM carrito")
        conn.commit()
        return {"message": "Carrito vaciado correctamente."}
    except Error as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()


@app.post("/carrito/finalizar")
def finalizar_compra():
    try:
        conn = get_connection()
        conn.start_transaction()
        cursor = conn.cursor(dictionary=True)

        cursor.execute(
            "SELECT c.id, c.id_producto, c.cantidad, p.precio, p.stock FROM carrito c "
            "INNER JOIN productos p ON c.id_producto = p.id"
        )
        items = cursor.fetchall()
        if not items:
            raise HTTPException(status_code=400, detail="El carrito está vacío.")

        total = 0
        for item in items:
            if item["stock"] < item["cantidad"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Stock insuficiente para el producto {item['id_producto']}. "
                        f"Disponible: {item['stock']}"
                    ),
                )
            total += item["precio"] * item["cantidad"]

        cursor.execute("SELECT saldo FROM usuario WHERE id = 1")
        usuario = cursor.fetchone()
        if not usuario:
            raise HTTPException(status_code=500, detail="Usuario no configurado.")
        if usuario["saldo"] < total:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Saldo insuficiente. Total a pagar: {total:.2f}, saldo disponible: {usuario['saldo']:.2f}"
                ),
            )

        for item in items:
            cursor.execute(
                "UPDATE productos SET stock = stock - %s WHERE id = %s",
                (item["cantidad"], item["id_producto"]),
            )

        cursor.execute("DELETE FROM carrito")
        cursor.execute("UPDATE usuario SET saldo = saldo - %s WHERE id = 1", (total,))
        conn.commit()
        return {"message": "Compra finalizada correctamente.", "total": total}
    except HTTPException:
        conn.rollback()
        raise
    except Error as exc:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        if conn.is_connected():
            cursor.close()
            conn.close()
