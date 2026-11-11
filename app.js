import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Tu configuración de Firebase proporcionada
const firebaseConfig = {
  apiKey: "AIzaSyCvcgCBTSid05eekA5vDsZO3Wg-6qb0IEY",
  authDomain: "ajuste-100.firebaseapp.com",
  databaseURL: "https://ajuste-100-default-rtdb.firebaseio.com",
  projectId: "ajuste-100",
  storageBucket: "ajuste-100.firebasestorage.app",
  messagingSenderId: "719390002462",
  appId: "1:719390002462:web:7274228fea8e54e0d60d0f",
  measurementId: "G-K5R11YH32W"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const WHATSAPP_NUMBER = "593999557476";

// Estado Global de la App sincronizado con Firebase
let appData = {
    services: [],
    bankDetails: 'Banco de Guayaquil\nCuenta de Ahorros: 123456789\nTitular: Maykel Fuenmayor',
    dailyLimit: 5,
    appointments: []
};

// Referencias DOM
const publicView = document.getElementById('public-view');
const adminView = document.getElementById('admin-view');
const logoTrigger = document.getElementById('logo-trigger');
const bookingForm = document.getElementById('booking-form');
const btnSubmit = document.getElementById('btn-submit');

// --- CARGA DE DATOS DESDE FIREBASE ---
async function loadDataFromFirebase() {
    try {
        // 1. Cargar Configuración General
        const configSnap = await getDoc(doc(db, "settings", "general"));
        if (configSnap.exists()) {
            appData.bankDetails = configSnap.data().bankDetails;
            appData.dailyLimit = configSnap.data().dailyLimit;
        } else {
            // Si no existe (primera vez), crearla con valores por defecto
            await setDoc(doc(db, "settings", "general"), { 
                bankDetails: appData.bankDetails, 
                dailyLimit: appData.dailyLimit 
            });
        }

        // 2. Cargar Servicios
        const servicesSnap = await getDocs(collection(db, "services"));
        if (servicesSnap.empty) {
            // Sembrar servicios por defecto si la base de datos está vacía
            const defaultServices = [
                { name: 'Terapia de Lenguaje', price: 20 },
                { name: 'Terapia cognitivo-conductual', price: 25 },
                { name: 'Psicopedagogía', price: 20 },
                { name: 'Logopedia / Fonoaudiología', price: 20 },
                { name: 'Evaluación Autismo (TEA)', price: 30 }
            ];
            const batch = writeBatch(db);
            defaultServices.forEach(s => {
                const newRef = doc(collection(db, "services"));
                batch.set(newRef, s);
                appData.services.push({ id: newRef.id, ...s });
            });
            await batch.commit();
        } else {
            appData.services = [];
            servicesSnap.forEach(doc => {
                appData.services.push({ id: doc.id, ...doc.data() });
            });
        }

        // 3. Cargar Citas
        await fetchAppointments();

        // Inicializar la interfaz visual
        initPublicView();
        btnSubmit.disabled = false; // Habilitar el botón de reserva
        btnSubmit.textContent = "Agendar por WhatsApp";
        
    } catch (error) {
        console.error("Error cargando base de datos: ", error);
        alert("Hubo un error de conexión con Firebase. Verifica tus reglas de seguridad.");
    }
}

async function fetchAppointments() {
    const apptsSnap = await getDocs(collection(db, "appointments"));
    appData.appointments = [];
    apptsSnap.forEach(doc => {
        appData.appointments.push({ id: doc.id, ...doc.data() });
    });
}

// Iniciar carga al abrir la página
loadDataFromFirebase();

// --- LÓGICA DEL LOGIN OCULTO ---
let clickCount = 0;
let clickTimer;

logoTrigger.addEventListener('click', () => {
    clickCount++;
    clearTimeout(clickTimer);
    
    if (clickCount === 5) {
        let pwd = prompt("Acceso Administrativo. Ingrese contraseña:");
        if (pwd === "admin123") {
            publicView.classList.add('hidden');
            adminView.classList.remove('hidden');
            renderAdminPanel();
        } else {
            alert("Contraseña incorrecta.");
        }
        clickCount = 0;
    }
    
    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 2000);
});

document.getElementById('btn-logout').addEventListener('click', () => {
    adminView.classList.add('hidden');
    publicView.classList.remove('hidden');
    initPublicView();
});

// --- VISTA PÚBLICA ---
function initPublicView() {
    const serviceList = document.getElementById('service-list');
    const serviceSelect = document.getElementById('service-select');
    
    serviceList.innerHTML = '';
    serviceSelect.innerHTML = '<option value="" disabled selected>Seleccione un servicio...</option>';
    
    appData.services.forEach(s => {
        // Lista visual
        const li = document.createElement('li');
        li.innerHTML = `<span>${s.name}</span> <strong>$${s.price}</strong>`;
        serviceList.appendChild(li);
        
        // Select del formulario
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.dataset.price = s.price;
        opt.textContent = `${s.name} ($${s.price})`;
        serviceSelect.appendChild(opt);
    });

    document.getElementById('bank-details').innerHTML = appData.bankDetails.replace(/\n/g, '<br>');
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('booking-date').setAttribute('min', today);
}

// Envío del Formulario a Firebase
bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Verificando...";
    
    const name = document.getElementById('client-name').value;
    const serviceSelect = document.getElementById('service-select');
    const service = serviceSelect.value;
    const price = serviceSelect.options[serviceSelect.selectedIndex].dataset.price;
    const date = document.getElementById('booking-date').value;
    const time = document.getElementById('booking-time').value;

    // Recargar citas desde la base de datos para evitar cruces en tiempo real
    await fetchAppointments();

    const appointmentsOnDate = appData.appointments.filter(a => a.date === date);
    if (appointmentsOnDate.length >= appData.dailyLimit) {
        alert("Lo sentimos, se ha alcanzado el límite máximo de citas para este día. Por favor elija otra fecha.");
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Agendar por WhatsApp";
        return;
    }

    const isTimeTaken = appointmentsOnDate.some(a => a.time === time);
    if (isTimeTaken) {
        alert("Esta hora ya está ocupada por otro paciente. Por favor seleccione otro horario.");
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Agendar por WhatsApp";
        return;
    }

    try {
        // Guardar cita en Firebase
        const newAppt = { name, service, price, date, time, timestamp: new Date().toISOString() };
        await addDoc(collection(db, "appointments"), newAppt);
        
        // Redirigir a WhatsApp
        const msg = `Hola MYK, me gustaría agendar una cita.%0A%0A*Paciente:* ${name}%0A*Servicio:* ${service}%0A*Precio Ref:* $${price}%0A*Fecha:* ${date}%0A*Hora:* ${time}%0A%0A¿Podrían confirmarme la disponibilidad y enviarme los datos para el pago?`;
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, '_blank');
        
        bookingForm.reset();
    } catch(err) {
        alert("Error al registrar la cita. Verifica la conexión.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.textContent = "Agendar por WhatsApp";
    }
});

// --- VISTA ADMINISTRACIÓN ---
function renderAdminPanel() {
    const adminServices = document.getElementById('admin-services-list');
    adminServices.innerHTML = '';
    
    appData.services.forEach(s => {
        const div = document.createElement('div');
        div.className = 'service-edit-row';
        div.innerHTML = `
            <span>${s.name}</span>
            <input type="number" id="price-${s.id}" value="${s.price}" min="0">
        `;
        adminServices.appendChild(div);
    });

    document.getElementById('admin-bank').value = appData.bankDetails;
    document.getElementById('admin-limit').value = appData.dailyLimit;
    
    renderAppointments();
}

function renderAppointments() {
    const ul = document.getElementById('admin-appointments');
    ul.innerHTML = '';
    
    if(appData.appointments.length === 0) {
        ul.innerHTML = '<li>No hay citas registradas en la nube.</li>';
        return;
    }

    const sorted = [...appData.appointments].sort((a,b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(a => {
        const li = document.createElement('li');
        li.style.marginBottom = "10px";
        li.style.borderBottom = "1px solid #ccc";
        li.innerHTML = `<strong>${a.date} - ${a.time}</strong><br>
                        Paciente: ${a.name}<br>
                        Servicio: ${a.service}`;
        ul.appendChild(li);
    });
}

// Guardar cambios en Firebase
document.getElementById('btn-save-services').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = "Guardando...";
    btn.disabled = true;

    try {
        const batch = writeBatch(db);
        appData.services.forEach(s => {
            const newPrice = Number(document.getElementById(`price-${s.id}`).value);
            s.price = newPrice;
            const docRef = doc(db, "services", s.id);
            batch.update(docRef, { price: newPrice });
        });
        await batch.commit();
        alert("Precios actualizados en la base de datos.");
        initPublicView();
    } catch(err) {
        alert("Error guardando precios.");
    } finally {
        btn.textContent = "Guardar Precios";
        btn.disabled = false;
    }
});

document.getElementById('btn-save-config').addEventListener('click', async (e) => {
    const btn = e.target;
    btn.textContent = "Guardando...";
    btn.disabled = true;

    try {
        appData.bankDetails = document.getElementById('admin-bank').value;
        appData.dailyLimit = Number(document.getElementById('admin-limit').value);
        
        await setDoc(doc(db, "settings", "general"), {
            bankDetails: appData.bankDetails,
            dailyLimit: appData.dailyLimit
        });
        alert("Configuración actualizada en la base de datos.");
        initPublicView();
    } catch (err) {
        alert("Error guardando configuración.");
    } finally {
        btn.textContent = "Guardar Configuración";
        btn.disabled = false;
    }
});

document.getElementById('btn-clear-appointments').addEventListener('click', async (e) => {
    if(confirm("¿Seguro que deseas BORRAR TODAS las citas de la base de datos? Esto no se puede deshacer.")) {
        const btn = e.target;
        btn.textContent = "Borrando...";
        btn.disabled = true;

        try {
            const batch = writeBatch(db);
            appData.appointments.forEach(a => {
                batch.delete(doc(db, "appointments", a.id));
            });
            await batch.commit();
            appData.appointments = [];
            renderAppointments();
            alert("Historial de citas borrado exitosamente.");
        } catch(err) {
            alert("Error al borrar citas.");
        } finally {
            btn.textContent = "Limpiar Todas las Citas";
            btn.disabled = false;
        }
    }
});
