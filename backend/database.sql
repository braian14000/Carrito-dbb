CREATE DATABASE IF NOT EXISTS carrito_db;
USE carrito_db;

CREATE TABLE IF NOT EXISTS productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    precio DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL,
    imagen VARCHAR(255) DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS carrito (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_producto INT NOT NULL,
    cantidad INT NOT NULL,
    FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS usuario (
    id INT PRIMARY KEY,
    saldo DECIMAL(10,2) NOT NULL DEFAULT 0,
    cargado_inicial BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES
(1, 'Camiseta', 299.99, 10, NULL),
(2, 'Pantalón', 599.99, 8, NULL),
(3, 'Zapatillas', 1299.99, 5, NULL),
(4, 'Gorra', 149.99, 12, NULL)
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    precio = VALUES(precio),
    stock = VALUES(stock),
    imagen = VALUES(imagen);

INSERT INTO usuario (id, saldo, cargado_inicial) VALUES (1, 0, FALSE)
ON DUPLICATE KEY UPDATE saldo = VALUES(saldo), cargado_inicial = VALUES(cargado_inicial);

DELETE FROM carrito;
