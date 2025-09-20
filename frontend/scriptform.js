document.getElementById('miFormulario').addEventListener('submit', async function(event) {
  event.preventDefault();

  const form = event.target;
  const formData = new FormData(form);
  const datosObjeto = {};

  for (let [key, value] of formData.entries()) {
    datosObjeto[key] = value;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.innerText = 'Procesando...';

  try {
    const response = await fetch('http://localhost:3000/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosObjeto)
    });

    if (response.ok) {
      console.log('✅ Datos enviados correctamente');
      // Redirige inmediatamente
      window.location.href = 'pdf.html';
    } else {
      throw new Error('Error en la respuesta del servidor');
    }
  } catch (error) {
    console.error('❌ Error al enviar:', error);
    const resultDiv = document.getElementById('result');
    resultDiv.innerText = 'Error al enviar los datos';
    resultDiv.style.display = 'block';

    submitBtn.disabled = false;
    submitBtn.innerText = 'Enviar solicitud';

    setTimeout(() => {
      resultDiv.innerText = '';
      resultDiv.style.display = 'none';
    }, 5000);
  }
});