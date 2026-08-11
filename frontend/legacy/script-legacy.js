const API_URLS = [
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8000'
];

const app = Vue.createApp({
  data() {
    return {
      apiBase: '',
      productos: [],
      carrito: [],
      usuario: { saldo: 0, cargado_inicial: false },
      currentUser: null,
      registro: {
        nombre: '',
        email: '',
        password: ''
      },
      login: {
        email: '',
        password: ''
      },
      saldoInput: '',
      loading: true,
      error: ''
    };
  },
  computed: {
    totalGeneral() {
      return this.carrito.reduce((total, item) => total + Number(item.subtotal || 0), 0);
    }
  },
  methods: {
    async detectApi() {
      for (const url of API_URLS) {
        try {
          const response = await fetch(`${url}/productos`, { method: 'GET' });
          if (response.ok) {
            this.apiBase = url;
            return;
          }
        } catch (error) {
          // intenta con la siguiente URL
        }
      }

      this.apiBase = API_URLS[0];
      this.error = 'No se encontró una API disponible en el puerto 3000 ni 8000.';
    },

    async fetchProductos() {
      try {
        const response = await fetch(`${this.apiBase}/productos`);
        if (!response.ok) throw new Error('No se pudo cargar la lista de productos.');
        const productos = await response.json();
        this.productos = productos.map((producto) => ({
          ...producto,
          cantidad: 1
        }));
        this.error = '';
      } catch (error) {
        this.error = error.message;
        this.productos = [];
      }
    },

    async fetchCarrito() {
      try {
        const response = await fetch(`${this.apiBase}/carrito`);
        if (!response.ok) throw new Error('No se pudo cargar el carrito.');
        this.carrito = await response.json();
      } catch (error) {
        this.carrito = [];
      }
    },

    async fetchUsuario() {
      try {
        const response = await fetch(`${this.apiBase}/usuario`);
        if (!response.ok) throw new Error('No se pudo cargar el saldo del usuario.');
        this.usuario = await response.json();
      } catch (error) {
        this.usuario = { saldo: 0, cargado_inicial: false };
      }
    },

    async registrarUsuario() {
      const { nombre, email, password } = this.registro;
      if (!nombre || !email || !password) {
        Swal.fire('Faltan datos', 'Completa nombre, email y contraseña.', 'warning');
        return;
      }

      try {
        const response = await fetch(`${this.apiBase}/registro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'No se pudo registrar el usuario.');

        this.currentUser = data.user;
        this.registro = { nombre: '', email: '', password: '' };
        Swal.fire('Éxito', data.message, 'success');
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async iniciarSesion() {
      const { email, password } = this.login;
      if (!email || !password) {
        Swal.fire('Faltan datos', 'Completa email y contraseña.', 'warning');
        return;
      }

      try {
        const response = await fetch(`${this.apiBase}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || 'No se pudo iniciar sesión.');

        this.currentUser = data.user;
        this.login = { email: '', password: '' };
        Swal.fire('Bienvenido', data.message, 'success');
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async cargarTodo() {
      await this.detectApi();
      await Promise.all([
        this.fetchProductos(),
        this.fetchCarrito(),
        this.fetchUsuario()
      ]);
      this.loading = false;
    },

    async agregarProducto(producto) {
      if (!this.currentUser) {
        Swal.fire('Debe iniciar sesión', 'Registrate o inicia sesión para comprar.', 'warning');
        return;
      }

      const cantidad = Number(producto.cantidad || 1);
      if (!Number.isFinite(cantidad) || cantidad < 1) {
        Swal.fire('Cantidad inválida', 'Ingresa una cantidad válida.', 'warning');
        return;
      }

      try {
        const response = await fetch(`${this.apiBase}/carrito/agregar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_producto: producto.id, cantidad })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || 'Error al agregar producto.');
        Swal.fire('Agregado', data.message, 'success');
        await this.fetchCarrito();
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async cargarSaldo() {
      const monto = Number(this.saldoInput);
      if (!Number.isFinite(monto) || monto <= 0) {
        Swal.fire('Monto inválido', 'Ingresa un monto mayor a cero.', 'warning');
        return;
      }

      try {
        const response = await fetch(`${this.apiBase}/usuario/cargar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monto })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || 'Error al cargar saldo.');
        Swal.fire('Saldo cargado', data.message, 'success');
        this.saldoInput = '';
        await this.fetchUsuario();
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async eliminarDelCarrito(item) {
      try {
        const response = await fetch(`${this.apiBase}/carrito/eliminar/${item.id}`, {
          method: 'DELETE'
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || 'No se pudo eliminar el producto.');
        Swal.fire('Eliminado', data.message, 'success');
        await this.fetchCarrito();
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async vaciarCarrito() {
      const result = await Swal.fire({
        title: 'Vaciar carrito',
        text: '¿Estás seguro de vaciar el carrito?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, vaciar'
      });

      if (!result.isConfirmed) return;

      try {
        const response = await fetch(`${this.apiBase}/carrito/vaciar`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || 'Error al vaciar carrito.');
        Swal.fire('Vaciado', data.message, 'success');
        await this.fetchCarrito();
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    },

    async finalizarCompra() {
      if (!this.currentUser) {
        Swal.fire('Debe iniciar sesión', 'Primero registrate o ingresá para finalizar la compra.', 'warning');
        return;
      }

      const result = await Swal.fire({
        title: 'Finalizar compra',
        text: '¿Deseas completar la compra y vaciar el carrito?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, finalizar'
      });

      if (!result.isConfirmed) return;

      try {
        const response = await fetch(`${this.apiBase}/carrito/finalizar`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.message || 'Error al finalizar compra.');
        Swal.fire('Compra finalizada', data.message, 'success');
        await Promise.all([
          this.fetchCarrito(),
          this.fetchProductos(),
          this.fetchUsuario()
        ]);
      } catch (error) {
        Swal.fire('Error', error.message, 'error');
      }
    }
  },
  mounted() {
    this.cargarTodo();
  }
});

app.mount('#app');
