<template>
  <div class="container py-4">
    <h1 class="mb-4 text-center fw-bold">Carrito Web con Vue + MySQL</h1>

    <div v-if="error" class="alert alert-danger" role="alert">{{ error }}</div>

    <div class="row g-4 mb-4">
      <div class="col-lg-6">
        <div class="card usuario-card shadow-sm h-100">
          <div class="card-body">
            <h2 class="h4 mb-3">Registro</h2>
            <div class="mb-3">
              <label class="form-label">Nombre</label>
              <input v-model="registro.nombre" type="text" class="form-control" placeholder="Tu nombre" />
            </div>
            <div class="mb-3">
              <label class="form-label">Email</label>
              <input v-model="registro.email" type="email" class="form-control" placeholder="correo@ejemplo.com" />
            </div>
            <div class="mb-3">
              <label class="form-label">Contraseña</label>
              <input v-model="registro.password" type="password" class="form-control" placeholder="Mínimo 4 caracteres" />
            </div>
            <button class="btn btn-primary w-100" @click="registrarUsuario">Crear cuenta</button>
          </div>
        </div>
      </div>

      <div class="col-lg-6">
        <div class="card usuario-card shadow-sm h-100">
          <div class="card-body">
            <h2 class="h4 mb-3">Iniciar sesión</h2>
            <div class="mb-3">
              <label class="form-label">Email</label>
              <input v-model="login.email" type="email" class="form-control" placeholder="correo@ejemplo.com" />
            </div>
            <div class="mb-3">
              <label class="form-label">Contraseña</label>
              <input v-model="login.password" type="password" class="form-control" placeholder="Tu contraseña" />
            </div>
            <button class="btn btn-success w-100" @click="iniciarSesion">Ingresar</button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="currentUser" class="alert alert-info mb-4">
      <strong>Bienvenido:</strong> {{ currentUser.nombre }} · Email: {{ currentUser.email }}
    </div>

    <div class="row gy-4">
      <div class="col-lg-7">
        <div class="card shadow-sm">
          <div class="card-header header-box text-white">
            <h2 class="h5 mb-0">Tienda / Catálogo</h2>
          </div>
          <div class="card-body">
            <div v-if="loading" class="text-center text-muted">Cargando productos…</div>
            <div v-else-if="productos.length === 0" class="text-center text-muted">No hay productos disponibles.</div>
            <div v-else class="row g-3">
              <div v-for="producto in productos" :key="producto.id" class="col-md-6">
                <div class="card card-producto h-100 shadow-sm">
                  <div class="card-body d-flex flex-column">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                      <h5 class="card-title mb-1">{{ producto.nombre }}</h5>
                      <span :class="['badge', producto.stock > 0 ? 'bg-success' : 'bg-danger', 'stock-badge']">Stock {{ producto.stock }}</span>
                    </div>
                    <p class="card-text mb-3">Precio: ${{ Number(producto.precio).toFixed(2) }}</p>
                    <div class="mt-auto">
                      <div class="input-group mb-2">
                        <input v-model.number="producto.cantidad" type="number" min="1" class="form-control" :disabled="producto.stock === 0" />
                      </div>
                      <button class="btn btn-primary w-100" :disabled="producto.stock === 0 || !currentUser" @click="agregarProducto(producto)">Agregar al carrito</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-5">
        <div class="card shadow-sm">
          <div class="card-header bg-success text-white">
            <h2 class="h5 mb-0">Carrito</h2>
          </div>
          <div class="card-body">
            <div class="mb-3">
              <div class="input-group">
                <span class="input-group-text">Saldo inicial</span>
                <input v-model.number="saldoInput" type="number" min="1" step="0.01" class="form-control" placeholder="Ingrese monto" :disabled="usuario.cargado_inicial" />
                <button class="btn btn-outline-primary" :disabled="usuario.cargado_inicial || !saldoInput || saldoInput <= 0" @click="cargarSaldo">Cargar</button>
              </div>
              <p class="mt-2 mb-0">Saldo disponible: <strong>${{ Number(usuario.saldo || 0).toFixed(2) }}</strong></p>
            </div>

            <div class="table-responsive">
              <table class="table table-sm align-middle mb-3">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="text-end">Cantidad</th>
                    <th class="text-end">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="carrito.length === 0">
                    <td colspan="4" class="text-center text-muted">El carrito está vacío.</td>
                  </tr>
                  <tr v-for="item in carrito" :key="item.id">
                    <td>{{ item.nombre }}</td>
                    <td class="text-end">{{ item.cantidad }}</td>
                    <td class="text-end">${{ Number(item.subtotal || 0).toFixed(2) }}</td>
                    <td class="text-end">
                      <button class="btn btn-sm btn-outline-danger" @click="eliminarDelCarrito(item)">Eliminar</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="d-flex justify-content-between align-items-center mb-3">
              <strong>Total General:</strong>
              <span>${{ totalGeneral.toFixed(2) }}</span>
            </div>

            <button class="btn btn-success w-100 mb-2" @click="finalizarCompra">Finalizar Compra</button>
            <button class="btn btn-outline-secondary w-100" @click="vaciarCarrito">Vaciar Carrito</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';

const API_URLS = ['http://127.0.0.1:3000', 'http://127.0.0.1:8000'];
const apiBase = ref('');
const productos = ref([]);
const carrito = ref([]);
const usuario = ref({ saldo: 0, cargado_inicial: false });
const currentUser = ref(null);
const registro = ref({ nombre: '', email: '', password: '' });
const login = ref({ email: '', password: '' });
const saldoInput = ref('');
const loading = ref(true);
const error = ref('');

const totalGeneral = computed(() => carrito.value.reduce((total, item) => total + Number(item.subtotal || 0), 0));

const detectApi = async () => {
  for (const url of API_URLS) {
    try {
      const response = await fetch(`${url}/productos`);
      if (response.ok) {
        apiBase.value = url;
        return;
      }
    } catch {
      // ignore and try next
    }
  }
  apiBase.value = API_URLS[0];
  error.value = 'No se encontró una API disponible en el puerto 3000 ni 8000.';
};

const fetchProductos = async () => {
  try {
    const response = await fetch(`${apiBase.value}/productos`);
    if (!response.ok) throw new Error('No se pudo cargar la lista de productos.');
    const data = await response.json();
    productos.value = data.map((item) => ({ ...item, cantidad: 1 }));
    error.value = '';
  } catch (err) {
    productos.value = [];
    error.value = err.message;
  }
};

const fetchCarrito = async () => {
  try {
    const response = await fetch(`${apiBase.value}/carrito`);
    carrito.value = response.ok ? await response.json() : [];
  } catch {
    carrito.value = [];
  }
};

const fetchUsuario = async () => {
  try {
    const response = await fetch(`${apiBase.value}/usuario`);
    usuario.value = response.ok ? await response.json() : { saldo: 0, cargado_inicial: false };
  } catch {
    usuario.value = { saldo: 0, cargado_inicial: false };
  }
};

const registrarUsuario = async () => {
  const { nombre, email, password } = registro.value;
  if (!nombre || !email || !password) {
    Swal.fire('Faltan datos', 'Completa nombre, email y contraseña.', 'warning');
    return;
  }
  try {
    const response = await fetch(`${apiBase.value}/registro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre, email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'No se pudo registrar el usuario.');
    currentUser.value = data.user;
    registro.value = { nombre: '', email: '', password: '' };
    Swal.fire('Éxito', data.message, 'success');
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const iniciarSesion = async () => {
  const { email, password } = login.value;
  if (!email || !password) {
    Swal.fire('Faltan datos', 'Completa email y contraseña.', 'warning');
    return;
  }
  try {
    const response = await fetch(`${apiBase.value}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'No se pudo iniciar sesión.');
    currentUser.value = data.user;
    login.value = { email: '', password: '' };
    Swal.fire('Bienvenido', data.message, 'success');
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const agregarProducto = async (producto) => {
  if (!currentUser.value) {
    Swal.fire('Debe iniciar sesión', 'Registrate o inicia sesión para comprar.', 'warning');
    return;
  }
  const cantidad = Number(producto.cantidad || 1);
  if (!Number.isFinite(cantidad) || cantidad < 1) {
    Swal.fire('Cantidad inválida', 'Ingresa una cantidad válida.', 'warning');
    return;
  }
  try {
    const response = await fetch(`${apiBase.value}/carrito/agregar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id_producto: producto.id, cantidad }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Error al agregar producto.');
    Swal.fire('Agregado', data.message, 'success');
    await fetchCarrito();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const cargarSaldo = async () => {
  const monto = Number(saldoInput.value);
  if (!Number.isFinite(monto) || monto <= 0) {
    Swal.fire('Monto inválido', 'Ingresa un monto mayor a cero.', 'warning');
    return;
  }
  try {
    const response = await fetch(`${apiBase.value}/usuario/cargar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monto }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Error al cargar saldo.');
    Swal.fire('Saldo cargado', data.message, 'success');
    saldoInput.value = '';
    await fetchUsuario();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const eliminarDelCarrito = async (item) => {
  try {
    const response = await fetch(`${apiBase.value}/carrito/eliminar/${item.id}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'No se pudo eliminar el producto.');
    Swal.fire('Eliminado', data.message, 'success');
    await fetchCarrito();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const vaciarCarrito = async () => {
  const result = await Swal.fire({
    title: 'Vaciar carrito',
    text: '¿Estás seguro de vaciar el carrito?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sí, vaciar',
  });
  if (!result.isConfirmed) return;
  try {
    const response = await fetch(`${apiBase.value}/carrito/vaciar`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Error al vaciar carrito.');
    Swal.fire('Vaciado', data.message, 'success');
    await fetchCarrito();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const finalizarCompra = async () => {
  if (!currentUser.value) {
    Swal.fire('Debe iniciar sesión', 'Primero registrate o ingresá para finalizar la compra.', 'warning');
    return;
  }
  const result = await Swal.fire({
    title: 'Finalizar compra',
    text: '¿Deseas completar la compra y vaciar el carrito?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'Sí, finalizar',
  });
  if (!result.isConfirmed) return;
  try {
    const response = await fetch(`${apiBase.value}/carrito/finalizar`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.message || 'Error al finalizar compra.');
    Swal.fire('Compra finalizada', data.message, 'success');
    await Promise.all([fetchCarrito(), fetchProductos(), fetchUsuario()]);
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
};

const cargarTodo = async () => {
  await detectApi();
  await Promise.all([fetchProductos(), fetchCarrito(), fetchUsuario()]);
  loading.value = false;
};

onMounted(cargarTodo);
</script>
