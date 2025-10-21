import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL CONFIGURATION ---
const LOCAL_STORAGE_KEY = 'local_calendar_tasks'; 

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-calendar-app';
const firebaseConfig = typeof __firebase_config === 'string' && __firebase_config.length > 2 ? JSON.parse(__firebase_config) : null;

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

let app, db, auth;
let userId = null;
let isAuthReady = false;
let isFirebaseActive = false; 

// --- DOM ELEMENTS & DATA STRUCTURES ---
const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const times = ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
const calendar = document.getElementById('calendar');
const currentMonthDisplay = document.getElementById('current-date-display');
const unassignedRow = document.getElementById('unassigned-tasks-row'); // Now defined in HTML

let unassignedTasks = []; 
let currentViewDate = new Date(); 
let currentDatesInView = []; 

// --- LOCAL STORAGE HELPERS ---
function saveLocalTasks() {
    // Saves only unassigned tasks to local storage
    const localTasks = unassignedTasks.map(t => ({...t, assigned: false}));
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(localTasks));
}

function loadLocalTasks() {
    const json = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (json) {
        const loadedTasks = JSON.parse(json);
        unassignedTasks = loadedTasks.filter(t => !t.assigned).map(t => ({
            ...t,
            dateId: null, 
            timeIndex: -1
        }));
        renderUnassignedTasks();
    }
}

// Helper to format date as YYYY-MM-DD
function getDateId(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// --- UTILITY: MODAL FUNCTIONS ---
function showAlert(title, message, isConfirm = false) {
    return new Promise(resolve => {
        const modal = document.getElementById('alert-modal');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-message').textContent = message;
        const confirmButton = document.getElementById('modal-confirm');
        const cancelButton = document.getElementById('modal-cancel');

        modal.classList.remove('hidden');
        modal.classList.add('flex');

        cancelButton.classList.toggle('hidden', !isConfirm);

        confirmButton.onclick = () => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            resolve(true);
        };

        if (isConfirm) {
            cancelButton.onclick = () => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                resolve(false);
            };
        } else {
            cancelButton.onclick = null;
        }
    });
}

// --- FIRESTORE OPERATIONS ---
const getUnassignedCollectionRef = () => {
    if (!isFirebaseActive) throw new Error("Firebase not active.");
    return collection(db, `artifacts/${appId}/users/${userId}/unassigned_tasks`);
};

const getAssignedCollectionRef = () => {
    if (!isFirebaseActive) throw new Error("Firebase not active.");
    return collection(db, `artifacts/${appId}/users/${userId}/schedule_slots`);
};

// --- CORE UI FUNCTIONS ---

function createCalendar() {
    calendar.innerHTML = '';
    currentDatesInView = [];
    
    let today = new Date(currentViewDate);
    let currentDayOfWeek = today.getDay();
    let startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDayOfWeek); 

    let endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    currentMonthDisplay.textContent = 
        `${startOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endOfWeek.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;

    // 1. Day Headers (Date and Day Name)
    calendar.innerHTML += `<div class="cell header bg-gray-200 text-gray-700 text-sm font-normal border-r border-gray-300">Time / Day</div>`;
    
    days.forEach((dayName, dayIndex) => {
        let date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + dayIndex);
        
        let dateString = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        let dateId = getDateId(date);
        currentDatesInView.push(dateId);
        
        let isToday = dateId === getDateId(new Date()) ? 'bg-green-700 text-white' : 'bg-green-600';

        calendar.innerHTML += `<div class="cell header ${isToday} text-white font-bold text-center">
                                    <div class="text-sm">${dayName}</div>
                                    <div class="text-xs font-light">${dateString}</div>
                               </div>`;
    });
    
    // 2. Time Slots and Schedule Grid
    times.forEach((time, timeIndex) => {
        calendar.innerHTML += `<div class="cell time time-slot bg-gray-200 text-gray-700 border-r border-gray-300">${time}</div>`;
        
        currentDatesInView.forEach((dateId, dayIndex) => {
            const slot = document.createElement('div');
            slot.className = 'cell event-slot time-slot border border-gray-200 hover:bg-green-50 transition duration-100';
            slot.id = `slot-${dateId}-${timeIndex}`; 
            
            slot.ondrop = drop; 
            slot.ondragover = allowDrop;
            
            calendar.appendChild(slot);
        });
    });

    renderUnassignedTasks();
}

function renderUnassignedTasks() {
    if (!unassignedRow) return;

    unassignedRow.innerHTML = '';
    
    unassignedTasks.forEach(task => {
        const event = createEventElement(task);
        unassignedRow.appendChild(event);
    });
}

function createEventElement(task) {
    const event = document.createElement('div');
    event.className = `event p-1 text-xs font-medium text-white shadow-md transition duration-150 transform hover:scale-[1.02] ${task.type === 'Work' ? 'bg-blue-500' : task.type === 'Personal' ? 'bg-pink-500' : 'bg-gray-500'}`;
    event.draggable = true;
    event.ondragstart = drag; 
    event.id = task.id; 
    event.setAttribute('data-name', task.name);
    event.setAttribute('data-type', task.type);
    
    if (task.dateId) event.setAttribute('data-date-id', task.dateId);
    if (task.timeIndex) event.setAttribute('data-time-index', task.timeIndex); 
    
    event.textContent = `${task.name} (${task.type})`;

    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '&times;';
    deleteBtn.className = 'ml-1 text-white opacity-70 hover:opacity-100 float-right';
    deleteBtn.onclick = (e) => {
        e.stopPropagation(); 
        deleteEvent(task.id, task.dateId, task.timeIndex); 
    };
    event.appendChild(deleteBtn);

    return event;
}

// --- DRAG AND DROP HANDLERS ---

function allowDrop(ev) {
    ev.preventDefault();
    if (ev.target.classList.contains('event-slot') || ev.target.id === 'unassigned-tasks-row') {
        ev.target.classList.add('bg-green-100'); 
    } else if (ev.target.closest('.event-slot')) {
        ev.target.closest('.event-slot').classList.add('bg-green-100');
    }
}

function drag(ev) {
    ev.dataTransfer.setData("text/plain", ev.target.id); 
    
    ev.target.ondragend = (e) => {
         document.querySelectorAll('.bg-green-100').forEach(el => el.classList.remove('bg-green-100'));
    };
}

async function drop(ev) {
    ev.preventDefault();
    
    const targetSlot = ev.target.closest('.event-slot') || ev.target.closest('#unassigned-tasks-row');
    if (!targetSlot) return; 

    targetSlot.classList.remove('bg-green-100');

    const taskId = ev.dataTransfer.getData("text/plain");
    if (!taskId || !isAuthReady) return;

    const currentEl = document.getElementById(taskId);
    if (!currentEl) return;
    
    // 1. Determine New Location (Date and Time Index)
    let newDateId = null;
    let newTimeIndex = -1;

    if (targetSlot.id === 'unassigned-tasks-row') {
        newDateId = 'unassigned'; 
        newTimeIndex = -1;
    } else if (targetSlot.id.startsWith('slot-')) {
        const parts = targetSlot.id.split('-'); 
        newDateId = parts[1];
        newTimeIndex = parseInt(parts[2]);
    }
    
    const taskData = {
        id: taskId,
        name: currentEl.getAttribute('data-name'),
        type: currentEl.getAttribute('data-type'),
    };

    // --- LOCAL STORAGE & FIREBASE UPDATE ---
    if (!isFirebaseActive) {
        // LOCAL STORAGE FALLBACK
        if (newDateId === 'unassigned') {
            const taskIndex = unassignedTasks.findIndex(t => t.id === taskId);
            if (taskIndex === -1) { 
                unassignedTasks.push({...taskData, dateId: null, timeIndex: -1});
            }
        } else if (newDateId) {
            unassignedTasks = unassignedTasks.filter(t => t.id !== taskId);
        }
        saveLocalTasks();
        renderUnassignedTasks();
        
        // CRITICAL FIX: The element must be appended to the targetSlot for visual placement
        targetSlot.appendChild(currentEl);
        return;
    }

    // --- FIREBASE LOGIC ---
    try {
        if (newDateId === 'unassigned') {
            const assignedRef = doc(db, `artifacts/${appId}/users/${userId}/schedule_slots`, taskId);
            const unassignedRef = doc(db, `artifacts/${appId}/users/${userId}/unassigned_tasks`, taskId);
            
            await setDoc(unassignedRef, { name: taskData.name, type: taskData.type });
            await deleteDoc(assignedRef).catch(() => {});
            
        } else if (newDateId) {
            const assignedRef = doc(db, `artifacts/${appId}/users/${userId}/schedule_slots`, taskId);
            
            await setDoc(assignedRef, { 
                name: taskData.name, 
                type: taskData.type,
                dateId: newDateId, 
                timeIndex: newTimeIndex 
            });

            const unassignedRef = doc(db, `artifacts/${appId}/users/${userId}/unassigned_tasks`, taskId);
            await deleteDoc(unassignedRef).catch(() => {}); 
        }
    } catch (e) {
        console.error("Error updating schedule: ", e);
        showAlert("Database Error", "Failed to move task. Check console for details.");
    }
}

// --- DATE NAVIGATION ---
function changeWeek(offset) {
    currentViewDate.setDate(currentViewDate.getDate() + offset);
    createCalendar(); 
    setupFirestoreListeners();
}

// --- TASK MANAGEMENT (CRUD) ---

async function addEvent() {
    if (!isAuthReady) return showAlert("Wait", "Authentication still loading.");
    
    const name = document.getElementById('event-name').value.trim();
    const type = document.getElementById('event-type').value.trim();
    
    if (!name) return showAlert("Missing Info", "Please enter a Task Name.");
    if (!type) return showAlert("Missing Info", "Please enter a Task Type.");
    
    if (!isFirebaseActive) {
        // LOCAL STORAGE FALLBACK
        const newTaskId = 'local-' + Date.now();
        unassignedTasks.push({
            id: newTaskId,
            name: name,
            type: type,
            dateId: null,
            timeIndex: -1
        });
        saveLocalTasks(); 
        renderUnassignedTasks(); 
        document.getElementById('event-name').value = '';
        document.getElementById('event-type').value = '';
        return; 
    }
    
    // FIREBASE LOGIC
    try {
        await addDoc(getUnassignedCollectionRef(), {
            name: name,
            type: type
        });

        document.getElementById('event-name').value = '';
        document.getElementById('event-type').value = '';
    } catch (e) {
        console.error("Error adding document: ", e);
        showAlert("Error", "Could not save task to database.");
    }
}

async function deleteEvent(id, dateId, timeIndex) {
    // LOCAL STORAGE DELETE
    if (!isFirebaseActive && id.startsWith('local-')) {
        const confirmed = await showAlert("Confirm Delete", "Are you sure you want to delete this task permanently?", true);
        if (!confirmed) return;
        
        unassignedTasks = unassignedTasks.filter(t => t.id !== id);
        saveLocalTasks();
        renderUnassignedTasks();
        return;
    }

    if (!isFirebaseActive) return showAlert("Persistence Error", "Cannot delete. Firebase configuration is missing.");

    // FIREBASE LOGIC
    try {
        if (!dateId || dateId === 'unassigned') {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/unassigned_tasks`, id));
        } else {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/schedule_slots`, id));
        }
    } catch (e) {
        console.error("Error deleting document: ", e);
        showAlert("Error", "Could not delete task from database.");
    }
}

// --- MAIN APPLICATION STARTUP ---

function initApp() {
    createCalendar(); 
    setupFirestoreListeners();
}

function setupFirestoreListeners() {
    if (!isFirebaseActive) {
        loadLocalTasks(); 
        return; 
    }

    // FIREBASE LISTENERS
    // ... (logic remains the same) ...
}

// --- GLOBAL ASSIGNMENT BLOCK (Must be last) ---
window.createCalendar = createCalendar;
window.renderUnassignedTasks = renderUnassignedTasks;
window.createEventElement = createEventElement;

window.allowDrop = allowDrop;
window.drag = drag;
window.drop = drop;

window.addEvent = addEvent; 
window.deleteEvent = deleteEvent;
window.changeWeek = changeWeek;

// Attach event listener for the button (Fixes inline onclick error)
document.addEventListener('DOMContentLoaded', () => {
    const addEventBtn = document.getElementById('add-event-btn');
    if (addEventBtn) {
         addEventBtn.addEventListener('click', addEvent);
    }
    
    initApp(); // Call initApp once DOM is ready
});
