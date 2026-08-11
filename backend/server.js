const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'carrito_db',
};

app.use(cors({ origin: '*' }));
app.use(express.json());

async function getConnection() {
  return mysql.createConnection(DB_CONFIG);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

async function initializeDatabase() {
  const adminConnection = await mysql.createConnection({
    host: DB_CONFIG.host,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
  });

  await adminConnection.execute('CREATE DATABASE IF NOT EXISTS carrito_db');
  await adminConnection.end();

  const connection = await getConnection();
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS productos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      precio DECIMAL(10,2) NOT NULL,
      stock INT NOT NULL,
      imagen VARCHAR(255) DEFAULT NULL
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS carrito (
      id INT AUTO_INCREMENT PRIMARY KEY,
      id_producto INT NOT NULL,
      cantidad INT NOT NULL,
      FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE CASCADE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS usuario (
      id INT PRIMARY KEY,
      saldo DECIMAL(10,2) NOT NULL DEFAULT 0,
      cargado_inicial BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      saldo DECIMAL(10,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await connection.execute(`
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
  `);

  await connection.execute(`
    INSERT INTO usuario (id, saldo, cargado_inicial) VALUES (1, 0, FALSE)
    ON DUPLICATE KEY UPDATE saldo = VALUES(saldo), cargado_inicial = VALUES(cargado_inicial)
  `);

  await connection.execute(`
    INSERT INTO usuarios (nombre, email, password_hash, saldo)
    VALUES ('Admin', 'admin@demo.com', ?, 500)
    ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), password_hash = VALUES(password_hash), saldo = VALUES(saldo)
  `, [hashPassword('123456')]);

  await connection.execute('DELETE FROM carrito');
  await connection.end();
}

app.get('/productos', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SELECT id, nombre, precio, stock, imagen FROM productos ORDER BY id');
    await connection.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.get('/carrito', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute(`
      SELECT c.id, c.id_producto, p.nombre, p.precio, c.cantidad,
             (p.precio * c.cantidad) AS subtotal
      FROM carrito c
      INNER JOIN productos p ON c.id_producto = p.id
      ORDER BY c.id
    `);
    await connection.end();
    res.json(rows);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/registro', async (req, res) => {
  const { nombre, email, password } = req.body || {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ detail: 'Nombre, email y contraseña son obligatorios.' });
  }

  if (String(password).length < 4) {
    return res.status(400).json({ detail: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  try {
    const connection = await getConnection();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [existing] = await connection.execute('SELECT id FROM usuarios WHERE email = ?', [normalizedEmail]);

    if (existing.length) {
      await connection.end();
      return res.status(409).json({ detail: 'Ya existe un usuario con ese email.' });
    }

    const passwordHash = hashPassword(password);
    const [result] = await connection.execute(
      'INSERT INTO usuarios (nombre, email, password_hash, saldo) VALUES (?, ?, ?, 0)',
      [String(nombre).trim(), normalizedEmail, passwordHash]
    );

    const [user] = await connection.execute(
      'SELECT id, nombre, email, saldo FROM usuarios WHERE id = ?',
      [result.insertId]
    );

    await connection.end();
    res.status(201).json({ message: 'Usuario registrado correctamente.', user: user[0] });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email y contraseña son obligatorios.' });
  }

  try {
    const connection = await getConnection();
    const normalizedEmail = String(email).trim().toLowerCase();
    const [rows] = await connection.execute(
      'SELECT id, nombre, email, saldo, password_hash FROM usuarios WHERE email = ?',
      [normalizedEmail]
    );

    await connection.end();

    if (!rows.length) {
      return res.status(401).json({ detail: 'Credenciales inválidas.' });
    }

    const user = rows[0];
    const hashed = hashPassword(password);

    if (user.password_hash !== hashed) {
      return res.status(401).json({ detail: 'Credenciales inválidas.' });
    }

    const safeUser = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      saldo: Number(user.saldo || 0)
    };

    res.json({ message: 'Inicio de sesión correcto.', user: safeUser });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.get('/usuario', async (req, res) => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.execute('SELECT id, saldo, cargado_inicial FROM usuario WHERE id = 1');
    await connection.end();
    if (!rows.length) {
      return res.status(500).json({ detail: 'Usuario no configurado.' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/usuario/cargar', async (req, res) => {
  const { monto } = req.body;
  if (Number(monto) <= 0) {
    return res.status(400).json({ detail: 'El monto debe ser mayor que cero.' });
  }

  try {
    const connection = await getConnection();
    const [usuarios] = await connection.execute('SELECT id, saldo, cargado_inicial FROM usuario WHERE id = 1');
    if (!usuarios.length) {
      await connection.end();
      return res.status(500).json({ detail: 'Usuario no configurado.' });
    }

    const usuario = usuarios[0];
    if (usuario.cargado_inicial) {
      await connection.end();
      return res.status(400).json({ detail: 'El saldo ya fue cargado y no se puede cargar nuevamente.' });
    }

    await connection.execute('UPDATE usuario SET saldo = ?, cargado_inicial = TRUE WHERE id = 1', [monto]);
    await connection.end();
    res.json({ message: 'Saldo inicial cargado correctamente.', saldo: Number(monto) });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/carrito/agregar', async (req, res) => {
  const { id_producto, cantidad } = req.body;
  if (Number(cantidad) <= 0) {
    return res.status(400).json({ detail: 'La cantidad debe ser mayor que cero.' });
  }

  try {
    const connection = await getConnection();
    const [productos] = await connection.execute('SELECT id, stock FROM productos WHERE id = ?', [id_producto]);
    if (!productos.length) {
      await connection.end();
      return res.status(404).json({ detail: 'Producto no encontrado.' });
    }

    const producto = productos[0];
    const [existente] = await connection.execute('SELECT id, cantidad FROM carrito WHERE id_producto = ?', [id_producto]);
    let nuevaCantidad = Number(cantidad);
    if (existente.length) {
      nuevaCantidad += Number(existente[0].cantidad);
    }

    if (producto.stock < nuevaCantidad) {
      await connection.end();
      return res.status(400).json({ detail: `Stock insuficiente. Disponible: ${producto.stock}` });
    }

    if (existente.length) {
      await connection.execute('UPDATE carrito SET cantidad = ? WHERE id = ?', [nuevaCantidad, existente[0].id]);
    } else {
      await connection.execute('INSERT INTO carrito (id_producto, cantidad) VALUES (?, ?)', [id_producto, cantidad]);
    }

    await connection.end();
    res.json({ message: 'Producto agregado al carrito.' });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.delete('/carrito/eliminar/:id', async (req, res) => {
  try {
    const connection = await getConnection();
    const [result] = await connection.execute('DELETE FROM carrito WHERE id = ?', [req.params.id]);
    await connection.end();
    if (result.affectedRows === 0) {
      return res.status(404).json({ detail: 'Artículo del carrito no encontrado.' });
    }
    res.json({ message: 'Producto eliminado del carrito.' });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/carrito/vaciar', async (req, res) => {
  try {
    const connection = await getConnection();
    await connection.execute('DELETE FROM carrito');
    await connection.end();
    res.json({ message: 'Carrito vaciado correctamente.' });
  } catch (error) {
    res.status(500).json({ detail: error.message });
  }
});

app.post('/carrito/finalizar', async (req, res) => {
  try {
    const connection = await getConnection();
    await connection.beginTransaction();

    const [items] = await connection.execute(`
      SELECT c.id, c.id_producto, c.cantidad, p.precio, p.stock
      FROM carrito c
      INNER JOIN productos p ON c.id_producto = p.id
    `);

    if (!items.length) {
      await connection.rollback();
      await connection.end();
      return res.status(400).json({ detail: 'El carrito está vacío.' });
    }

    let total = 0;
    for (const item of items) {
      if (item.stock < item.cantidad) {
        await connection.rollback();
        await connection.end();
        return res.status(400).json({ detail: `Stock insuficiente para el producto ${item.id_producto}. Disponible: ${item.stock}` });
      }
      total += Number(item.precio) * Number(item.cantidad);
    }

    const [usuarios] = await connection.execute('SELECT saldo FROM usuario WHERE id = 1');
    if (!usuarios.length) {
      await connection.rollback();
      await connection.end();
      return res.status(500).json({ detail: 'Usuario no configurado.' });
    }

    const usuario = usuarios[0];
    if (Number(usuario.saldo) < total) {
      await connection.rollback();
      await connection.end();
      return res.status(400).json({ detail: `Saldo insuficiente. Total a pagar: ${total.toFixed(2)}, saldo disponible: ${Number(usuario.saldo).toFixed(2)}` });
    }

    for (const item of items) {
      await connection.execute('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id_producto]);
    }

    await connection.execute('DELETE FROM carrito');
    await connection.execute('UPDATE usuario SET saldo = saldo - ? WHERE id = 1', [total]);
    await connection.commit();
    await connection.end();
    res.json({ message: 'Compra finalizada correctamente.', total });
  } catch (error) {
    try {
      const connection = await getConnection();
      await connection.rollback();
      await connection.end();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ detail: error.message });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Servidor corriendo en http://127.0.0.1:${port}`);
    });
  })
  .catch((error) => {
    console.error('Error al inicializar la base de datos:', error.message);
    process.exit(1);
  });
