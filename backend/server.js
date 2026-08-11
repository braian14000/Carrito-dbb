const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'carrito.db'));

app.use(cors({ origin: '*' }));
app.use(express.json());

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function run(query, params = []) {
  return db.prepare(query).run(...params);
}

function getOne(query, params = []) {
  return db.prepare(query).get(...params);
}

function getAll(query, params = []) {
  return db.prepare(query).all(...params);
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      stock INTEGER NOT NULL,
      imagen TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      saldo REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS carrito (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_producto INTEGER NOT NULL,
      cantidad INTEGER NOT NULL,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
      FOREIGN KEY (id_producto) REFERENCES productos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS usuario_saldo (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      saldo REAL NOT NULL DEFAULT 0,
      cargado_inicial INTEGER NOT NULL DEFAULT 0
    );
  `);

  const existingSaldo = getOne('SELECT id FROM usuario_saldo WHERE id = 1');
  if (!existingSaldo) {
    run('INSERT INTO usuario_saldo (id, saldo, cargado_inicial) VALUES (1, 0, 0)');
  }

  const adminCount = getOne('SELECT COUNT(*) AS count FROM usuarios WHERE email = ?', ['admin@demo.com']);
  if (!adminCount || adminCount.count === 0) {
    run('INSERT INTO usuarios (nombre, email, password_hash, saldo) VALUES (?, ?, ?, ?)', ['Admin', 'admin@demo.com', hashPassword('123456'), 500]);
  }

  const productCount = getOne('SELECT COUNT(*) AS count FROM productos');
  if (!productCount || productCount.count === 0) {
    run('INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES (?, ?, ?, ?, ?)', [1, 'Camiseta', 299.99, 10, null]);
    run('INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES (?, ?, ?, ?, ?)', [2, 'Pantalón', 599.99, 8, null]);
    run('INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES (?, ?, ?, ?, ?)', [3, 'Zapatillas', 1299.99, 5, null]);
    run('INSERT INTO productos (id, nombre, precio, stock, imagen) VALUES (?, ?, ?, ?, ?)', [4, 'Gorra', 149.99, 12, null]);
  }
}

function getSafeUser(user) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    saldo: Number(user.saldo || 0),
  };
}

function getCartItemsForUser(userId) {
  return getAll(`
    SELECT c.id, c.id_producto, p.nombre, p.precio, c.cantidad,
           (p.precio * c.cantidad) AS subtotal
    FROM carrito c
    INNER JOIN productos p ON c.id_producto = p.id
    WHERE c.id_usuario = ?
    ORDER BY c.id
  `, [userId]);
}

initDatabase();

app.get('/productos', (req, res) => {
  res.json(getAll('SELECT id, nombre, precio, stock, imagen FROM productos ORDER BY id'));
});

app.get('/carrito', (req, res) => {
  const userId = Number(req.query.userId || 0);
  if (!userId) {
    return res.json([]);
  }
  res.json(getCartItemsForUser(userId));
});

app.post('/registro', (req, res) => {
  const { nombre, email, password } = req.body || {};

  if (!nombre || !email || !password) {
    return res.status(400).json({ detail: 'Nombre, email y contraseña son obligatorios.' });
  }

  if (String(password).length < 4) {
    return res.status(400).json({ detail: 'La contraseña debe tener al menos 4 caracteres.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = getOne('SELECT id FROM usuarios WHERE email = ?', [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ detail: 'Ya existe un usuario con ese email.' });
  }

  const result = run(
    'INSERT INTO usuarios (nombre, email, password_hash, saldo) VALUES (?, ?, ?, ?)',
    [String(nombre).trim(), normalizedEmail, hashPassword(password), 0]
  );

  const user = getOne('SELECT id, nombre, email, saldo FROM usuarios WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: 'Usuario registrado correctamente.', user: getSafeUser(user) });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ detail: 'Email y contraseña son obligatorios.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = getOne('SELECT id, nombre, email, saldo, password_hash FROM usuarios WHERE email = ?', [normalizedEmail]);

  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ detail: 'Credenciales inválidas.' });
  }

  res.json({ message: 'Inicio de sesión correcto.', user: getSafeUser(user) });
});

app.get('/usuario', (req, res) => {
  const userId = Number(req.query.userId || 0);
  const saldoRow = getOne('SELECT saldo, cargado_inicial FROM usuario_saldo WHERE id = 1');
  if (!saldoRow) {
    return res.status(500).json({ detail: 'Usuario no configurado.' });
  }
  res.json({ id: 1, saldo: Number(saldoRow.saldo), cargado_inicial: Boolean(saldoRow.cargado_inicial) });
});

app.post('/usuario/cargar', (req, res) => {
  const { monto } = req.body;
  if (Number(monto) <= 0) {
    return res.status(400).json({ detail: 'El monto debe ser mayor que cero.' });
  }

  const saldoRow = getOne('SELECT cargado_inicial FROM usuario_saldo WHERE id = 1');
  if (saldoRow && saldoRow.cargado_inicial) {
    return res.status(400).json({ detail: 'El saldo ya fue cargado y no se puede cargar nuevamente.' });
  }

  run('UPDATE usuario_saldo SET saldo = ?, cargado_inicial = 1 WHERE id = 1', [Number(monto)]);
  res.json({ message: 'Saldo inicial cargado correctamente.', saldo: Number(monto) });
});

app.post('/carrito/agregar', (req, res) => {
  const { id_producto, cantidad, userId } = req.body;
  const qty = Number(cantidad);
  const targetUserId = Number(userId);

  if (!targetUserId) {
    return res.status(401).json({ detail: 'Debes iniciar sesión para agregar productos.' });
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ detail: 'La cantidad debe ser mayor que cero.' });
  }

  const producto = getOne('SELECT id, stock FROM productos WHERE id = ?', [Number(id_producto)]);
  if (!producto) {
    return res.status(404).json({ detail: 'Producto no encontrado.' });
  }

  const existingItem = getOne('SELECT id, cantidad FROM carrito WHERE id_usuario = ? AND id_producto = ?', [targetUserId, Number(id_producto)]);
  const nuevaCantidad = existingItem ? existingItem.cantidad + qty : qty;

  if (producto.stock < nuevaCantidad) {
    return res.status(400).json({ detail: `Stock insuficiente. Disponible: ${producto.stock}` });
  }

  if (existingItem) {
    run('UPDATE carrito SET cantidad = ? WHERE id = ?', [nuevaCantidad, existingItem.id]);
  } else {
    run('INSERT INTO carrito (id_usuario, id_producto, cantidad) VALUES (?, ?, ?)', [targetUserId, Number(id_producto), qty]);
  }

  res.json({ message: 'Producto agregado al carrito.' });
});

app.delete('/carrito/eliminar/:id', (req, res) => {
  const itemId = Number(req.params.id);
  const userId = Number(req.query.userId || 0);

  if (!userId) {
    return res.status(401).json({ detail: 'Debes iniciar sesión para modificar el carrito.' });
  }

  const item = getOne('SELECT id FROM carrito WHERE id = ? AND id_usuario = ?', [itemId, userId]);
  if (!item) {
    return res.status(404).json({ detail: 'Artículo del carrito no encontrado.' });
  }

  run('DELETE FROM carrito WHERE id = ? AND id_usuario = ?', [itemId, userId]);
  res.json({ message: 'Producto eliminado del carrito.' });
});

app.post('/carrito/vaciar', (req, res) => {
  const userId = Number(req.body.userId || 0);
  if (!userId) {
    return res.status(401).json({ detail: 'Debes iniciar sesión para vaciar el carrito.' });
  }
  run('DELETE FROM carrito WHERE id_usuario = ?', [userId]);
  res.json({ message: 'Carrito vaciado correctamente.' });
});

app.post('/carrito/finalizar', (req, res) => {
  const userId = Number(req.body.userId || 0);
  if (!userId) {
    return res.status(401).json({ detail: 'Debes iniciar sesión para finalizar la compra.' });
  }

  const items = getAll('SELECT c.id, c.id_producto, c.cantidad, p.precio, p.stock FROM carrito c INNER JOIN productos p ON c.id_producto = p.id WHERE c.id_usuario = ?', [userId]);
  if (!items.length) {
    return res.status(400).json({ detail: 'El carrito está vacío.' });
  }

  let total = 0;
  for (const item of items) {
    if (item.stock < item.cantidad) {
      return res.status(400).json({ detail: `Stock insuficiente para el producto ${item.id_producto}. Disponible: ${item.stock}` });
    }
    total += Number(item.precio) * Number(item.cantidad);
  }

  const saldoRow = getOne('SELECT saldo FROM usuario_saldo WHERE id = 1');
  if (!saldoRow || Number(saldoRow.saldo) < total) {
    return res.status(400).json({ detail: `Saldo insuficiente. Total a pagar: ${total.toFixed(2)}, saldo disponible: ${Number(saldoRow?.saldo || 0).toFixed(2)}` });
  }

  for (const item of items) {
    run('UPDATE productos SET stock = stock - ? WHERE id = ?', [item.cantidad, item.id_producto]);
  }

  run('UPDATE usuario_saldo SET saldo = saldo - ? WHERE id = 1', [total]);
  run('DELETE FROM carrito WHERE id_usuario = ?', [userId]);
  res.json({ message: 'Compra finalizada correctamente.', total });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://127.0.0.1:${port}`);
});
