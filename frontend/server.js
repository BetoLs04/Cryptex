const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3000;

// 🛡️ Configuración CORS para permitir solicitudes desde Live Server
app.use(cors({
  origin: 'http://127.0.0.1:5500',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// 🛡️ Respuesta a preflight OPTIONS
app.options('/submit', cors());

// 🧱 Middleware para procesar JSON y servir archivos estáticos
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname)); // Sirve archivos como scriptform.js y stylesform.css

// 📄 Ruta para servir el formulario HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'form.html'));
});

// 🗃️ Conexión a la base de datos
const db = new sqlite3.Database('./mi_base.db');

// 🧩 Crear tabla si no existe
db.run(`
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT
  )
`);

// 📥 Ruta para recibir datos del formulario
app.post('/submit', (req, res) => {
  const jsonString = JSON.stringify(req.body);

  db.run(`INSERT INTO records (data) VALUES (?)`, [jsonString], function(err) {
    if (err) {
      console.error('❌ Error al insertar:', err.message);
      return res.status(500).send('Error al guardar los datos');
    }
    console.log(`✅ Registro insertado con ID ${this.lastID}`);
    res.send('✅ Solicitud enviada correctamente');
  });
});

// 📤 Ruta para consultar registros guardados
app.get('/registros', (req, res) => {
  db.all(`SELECT * FROM records`, [], (err, rows) => {
    if (err) {
      console.error('❌ Error al consultar:', err.message);
      return res.status(500).send('Error al obtener los registros');
    }
    res.json(rows); // ← devuelve los registros como JSON
  });
});
app.get('/ultimo', (req, res) => {
  db.get(`SELECT * FROM records ORDER BY id DESC LIMIT 1`, [], (err, row) => {
    if (err) {
      console.error('❌ Error al consultar último registro:', err.message);
      return res.status(500).send('Error al obtener el último registro');
    }
    res.json(row);
  });
});
// 🚀 Iniciar servidor
app.listen(port, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${port}`);
});