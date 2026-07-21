
// ===== STUDY GROVE — App Logic =====

(function() {
'use strict';

// --- State ---
const STATES = { IDLE: 'idle', FOCUS: 'focus', FOCUS_OT: 'focus_overtime', BREAK: 'break', BREAK_OT: 'break_overtime' };
let state = STATES.IDLE;
let timerInterval = null;
let msLeft = 0;
let overtimeMs = 0;
let lastTickTime = null;
let currentSessionNum = 1;
let sessionsBeforeLong = 4;
let dailySessionGoal = 4;
let sessionStartTime = null;
let sessionCompletionStatus = []; // tracks 'success' or 'skipped' per completed session

const defaultSettings = { focusMin: 30, breakMin: 5, longBreakMin: 15, sessionsBeforeLong: 4, pipStyle: 'minimal' };

// --- DOM refs ---
const $ = id => document.getElementById(id);
const timerDisplay = $('timer-display');
const timerModeText = $('timer-mode-text');
const timerSessionInfo = $('timer-session-info');
const btnStart = $('btn-start');
const btnStartText = $('btn-start-text');
const ringProgress = $('timer-ring-progress');
const ringOvertime = $('timer-ring-overtime');
const settingFocus = $('setting-focus');
const settingBreak = $('setting-break');
const settingLongbreak = $('setting-longbreak');

// --- LocalStorage ---
function loadData() {
    try { return JSON.parse(localStorage.getItem('studyGroveData')) || { settings: {...defaultSettings}, sessions: [], plant: { totalSessions: 0, stage: 0 } }; }
    catch { return { settings: {...defaultSettings}, sessions: [], plant: { totalSessions: 0, stage: 0 } }; }
}
function saveData(data) { localStorage.setItem('studyGroveData', JSON.stringify(data)); }

let appData = loadData();
let settings = appData.settings || {...defaultSettings};
if (!appData.archive) appData.archive = [];
if (!appData.plant.startDate) {
    if (appData.sessions && appData.sessions.length > 0) {
        appData.plant.startDate = appData.sessions[0].startTime || appData.sessions[0].date;
    } else {
        appData.plant.startDate = new Date().toISOString();
    }
}
if (!appData.plant.type) appData.plant.type = 'oak';

// --- Plant Types ---
const PLANT_TYPES = {
    herb: {
        id: 'herb', name: 'Herb', icon: '🌿', totalHours: 10,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 60 },
            { name: 'Herb', minutes: 240 },
            { name: 'Full Herb', minutes: 600 }
        ],
        colors: { stem: '#5B7A3A', leaf: '#6B8E3A', leafStroke: '#4A6E2A', flower: null }
    },
    sunflower: {
        id: 'sunflower', name: 'Sunflower', icon: '🌻', totalHours: 15,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 60 },
            { name: 'Stem', minutes: 180 },
            { name: 'Bud', minutes: 450 },
            { name: 'Sunflower', minutes: 900 }
        ],
        colors: { stem: '#5B7A3A', leaf: '#6B8E3A', leafStroke: '#4A6E2A', flower: '#F4C430' }
    },
    rose: {
        id: 'rose', name: 'Rose', icon: '🌹', totalHours: 20,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 90 },
            { name: 'Bush', minutes: 300 },
            { name: 'Bud', minutes: 720 },
            { name: 'Rose', minutes: 1200 }
        ],
        colors: { stem: '#3A5C2A', leaf: '#5A7A3A', leafStroke: '#3A5C2A', flower: '#C74B50' }
    },
    oak: {
        id: 'oak', name: 'Oak', icon: '🌳', totalHours: 25,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 90 },
            { name: 'Seedling', minutes: 240 },
            { name: 'Sapling', minutes: 480 },
            { name: 'Tree', minutes: 900 },
            { name: 'Mighty Oak', minutes: 1500 }
        ],
        colors: { stem: '#5B7A3A', leaf: '#7A9A4A', leafStroke: '#5B7A3A', flower: '#FFFDF7' }
    },
    cherry: {
        id: 'cherry', name: 'Cherry Blossom', icon: '🌸', totalHours: 35,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 120 },
            { name: 'Seedling', minutes: 360 },
            { name: 'Sapling', minutes: 720 },
            { name: 'Tree', minutes: 1260 },
            { name: 'Cherry Blossom', minutes: 2100 }
        ],
        colors: { stem: '#6B4E3D', leaf: '#7A9A4A', leafStroke: '#5B7A3A', flower: '#F8B4C8' }
    },
    palm: {
        id: 'palm', name: 'Palm', icon: '🌴', totalHours: 50,
        stages: [
            { name: 'Seed', minutes: 0 },
            { name: 'Sprout', minutes: 180 },
            { name: 'Seedling', minutes: 600 },
            { name: 'Young Palm', minutes: 1200 },
            { name: 'Tall Palm', minutes: 2100 },
            { name: 'Royal Palm', minutes: 3000 }
        ],
        colors: { stem: '#8B7355', leaf: '#4A8B3A', leafStroke: '#3A6B2A', flower: null }
    }
};

function getActivePlantType() {
    return PLANT_TYPES[appData.plant.type] || PLANT_TYPES.oak;
}

function getActiveStages() {
    return getActivePlantType().stages;
}

// --- Timer Ring SVG Setup ---
const CIRCUMFERENCE = 2 * Math.PI * 120;
function initRing() {
    ringProgress.style.strokeDasharray = CIRCUMFERENCE;
    ringProgress.style.strokeDashoffset = 0;
    ringOvertime.style.strokeDasharray = CIRCUMFERENCE;
    ringOvertime.style.strokeDashoffset = CIRCUMFERENCE;
    // Tick marks
    const tickG = $('tick-marks');
    tickG.innerHTML = '';
    for (let i = 0; i < 60; i++) {
        const angle = (i * 6) * Math.PI / 180;
        const isMajor = i % 5 === 0;
        const r1 = isMajor ? 130 : 133;
        const r2 = 138;
        const x1 = 140 + r1 * Math.cos(angle), y1 = 140 + r1 * Math.sin(angle);
        const x2 = 140 + r2 * Math.cos(angle), y2 = 140 + r2 * Math.sin(angle);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        if (isMajor) line.classList.add('tick-major');
        tickG.appendChild(line);
    }
}

function setRingProgress(fraction) {
    const offset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, fraction)));
    ringProgress.style.strokeDashoffset = offset;
}

function setOvertimeRing(otSeconds, maxOT) {
    const frac = Math.min(1, otSeconds / maxOT);
    ringOvertime.style.strokeDashoffset = CIRCUMFERENCE * (1 - frac);
    ringOvertime.style.opacity = '1';
}

// --- Format ---
function fmt(ms) {
    const isNeg = ms < 0;
    const absMs = Math.abs(ms);
    const totalSec = Math.ceil(absMs / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    
    const prefix = isNeg ? '-' : (state === STATES.FOCUS_OT || state === STATES.BREAK_OT ? '+' : '');
    return prefix + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function fmtDuration(totalSec) {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// --- UI Updates ---
function updateDisplay() {
    if (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) {
        timerDisplay.textContent = '+' + fmt(overtimeMs).replace('+','');
    } else {
        timerDisplay.textContent = fmt(msLeft);
    }
}

function updateBodyState() {
    document.body.classList.remove('state-break', 'state-overtime', 'timer-running');
    if (state === STATES.BREAK || state === STATES.BREAK_OT) document.body.classList.add('state-break');
    if (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) document.body.classList.add('state-overtime');
    if (timerInterval && typeof animationLock !== 'undefined' && !animationLock) {
        document.body.classList.add('timer-running');
    }
}

function updateModeLabel() {
    if (state === STATES.FOCUS || state === STATES.FOCUS_OT) timerModeText.textContent = state === STATES.FOCUS_OT ? 'OVERTIME' : 'FOCUS';
    else if (state === STATES.BREAK || state === STATES.BREAK_OT) timerModeText.textContent = state === STATES.BREAK_OT ? 'OVERTIME' : 'BREAK';
    else timerModeText.textContent = 'FOCUS';
}

function updateSessionInfo() {
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
    const cur = roman[Math.min(currentSessionNum - 1, 19)] || currentSessionNum;
    const tot = roman[Math.min(dailySessionGoal - 1, 19)] || dailySessionGoal;
    timerSessionInfo.textContent = `Session ${cur} of ${tot}`;
}

function updateSessionDots() {
    const container = $('session-indicators');
    if (!container) return;
    
    container.innerHTML = '';
    const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
    
    for (let i = 0; i < dailySessionGoal; i++) {
        const dot = document.createElement('div');
        dot.className = 'session-dot';
        dot.setAttribute('data-session', i + 1);
        dot.setAttribute('data-label', roman[i] || (i + 1));
        
        if (i < currentSessionNum - 1) {
            dot.classList.add('completed');
            // Apply success/skipped ring color
            const status = sessionCompletionStatus[i];
            if (status === 'success') dot.classList.add('completed-success');
            else if (status === 'skipped') dot.classList.add('completed-skipped');
        }
        else if (i === currentSessionNum - 1) {
            dot.classList.add('active');
            // Also show green/red on active dot during break
            const status = sessionCompletionStatus[i];
            if (status === 'success') dot.classList.add('completed-success');
            else if (status === 'skipped') dot.classList.add('completed-skipped');
        }
        
        container.appendChild(dot);
    }
}

function updateSettingsBar() {
    settingFocus.value = settings.focusMin;
    settingBreak.value = settings.breakMin;
    settingLongbreak.value = settings.longBreakMin;
}

function updateButton() {
    if (state === STATES.IDLE) { btnStartText.textContent = 'Start'; }
    else if (timerInterval) { btnStartText.textContent = 'Pause'; }
    else { btnStartText.textContent = 'Resume'; }
}

// --- Timer Logic ---
function getTotalSeconds(type) {
    if (type === 'focus') return settings.focusMin * 60;
    if (type === 'longbreak') return settings.longBreakMin * 60;
    return settings.breakMin * 60;
}

function startFocus() {
    state = STATES.FOCUS;
    msLeft = getTotalSeconds('focus') * 1000;
    overtimeMs = 0;
    sessionStartTime = new Date();
    ringOvertime.style.opacity = '0';
    updateModeLabel(); updateDisplay(); updateBodyState(); updateButton();
    
    void document.body.offsetHeight;
    setRingProgress(1);
    startTicking(true);
}

function startBreak() {
    const isLong = (currentSessionNum % sessionsBeforeLong === 0);
    state = STATES.BREAK;
    msLeft = getTotalSeconds(isLong ? 'longbreak' : 'break') * 1000;
    overtimeMs = 0;
    sessionStartTime = new Date();
    ringOvertime.style.opacity = '0';
    updateModeLabel(); updateDisplay(); updateBodyState(); updateButton();
    
    void document.body.offsetHeight;
    setRingProgress(1);
    startTicking(true);
}

let animationLock = false;

function startTicking(animate = false) {
    if (timerInterval) clearInterval(timerInterval);
    lastTickTime = Date.now();
    timerInterval = setInterval(tick, 20);
    updateButton();
    
    if (animate) {
        animationLock = true;
        document.body.classList.remove('timer-running');
        setTimeout(() => {
            animationLock = false;
            if (timerInterval) document.body.classList.add('timer-running');
        }, 500);
    } else {
        document.body.classList.add('timer-running');
    }
}

function stopTicking() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    document.body.classList.remove('timer-running');
    animationLock = false;
    updateButton();
}

function tick() {
    const now = Date.now();
    const delta = now - lastTickTime;
    lastTickTime = now;

    if (state === STATES.FOCUS) {
        msLeft -= delta;
        const total = getTotalSeconds('focus') * 1000;
        if (!animationLock) setRingProgress(msLeft / total);
        if (msLeft <= 0) {
            state = STATES.FOCUS_OT;
            overtimeMs = -msLeft;
            updateModeLabel(); updateBodyState();
            playBell();
        }
    } else if (state === STATES.FOCUS_OT) {
        overtimeMs += delta;
        setOvertimeRing(overtimeMs / 1000, 600);
    } else if (state === STATES.BREAK) {
        msLeft -= delta;
        const total = getTotalSeconds((currentSessionNum % sessionsBeforeLong === 0) ? 'longbreak' : 'break') * 1000;
        if (!animationLock) setRingProgress(msLeft / total);
        if (msLeft <= 0) {
            state = STATES.BREAK_OT;
            overtimeMs = -msLeft;
            playBell();
        }
    } else if (state === STATES.BREAK_OT) {
        overtimeMs += delta;
        setOvertimeRing(overtimeMs / 1000, 600);
    }
    updateDisplay();
    updateModeLabel();
    updateBodyState();
}

function recordSession(type, completed) {
    const plannedSec = getTotalSeconds(type === 'focus' ? 'focus' : ((currentSessionNum % sessionsBeforeLong === 0) ? 'longbreak' : 'break'));
    const ot = (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) ? (overtimeMs / 1000) : 0;
    const actual = completed ? plannedSec + ot : plannedSec - (msLeft / 1000);
    
    // Only record incomplete sessions to history if at least 1 minute passed
    if (!completed && actual < 60) return;
    
    const session = {
        date: new Date().toISOString().split('T')[0],
        type: type,
        plannedDuration: plannedSec,
        actualDuration: actual,
        overtime: ot,
        startTime: sessionStartTime ? sessionStartTime.toISOString() : new Date().toISOString(),
        endTime: new Date().toISOString(),
        completed: !!completed
    };
    appData.sessions.push(session);
    if (type === 'focus') {
        updatePlant();
    }
    saveData(appData);
}

// --- Button Handlers ---
btnStart.addEventListener('click', () => {
    if (state === STATES.IDLE) {
        startFocus();
    } else if (timerInterval) {
        // Pause the timer
        stopTicking();
    } else {
        // Resume the timer
        startTicking();
    }
});

$('btn-reset').addEventListener('click', () => {
    stopTicking();
    state = STATES.IDLE;
    msLeft = getTotalSeconds('focus') * 1000;
    overtimeMs = 0;
    currentSessionNum = 1;
    sessionCompletionStatus = [];
    ringOvertime.style.opacity = '0';
    updateBodyState(); // removes timer-running
    void document.body.offsetHeight; // force reflow so CSS transition restores
    setRingProgress(0); // Animate to empty
    updateDisplay();
    updateModeLabel();
    updateBodyState();
    updateButton();
    updateSessionDots();
    updateSessionInfo();
    timerDisplay.textContent = fmt(msLeft);
});

$('btn-skip').addEventListener('click', () => {
    if (state === STATES.IDLE) {
        startBreak();
    } else if (state === STATES.FOCUS || state === STATES.FOCUS_OT) {
        const completed = state === STATES.FOCUS_OT;
        stopTicking();
        // Track whether this focus session was completed or skipped
        sessionCompletionStatus[currentSessionNum - 1] = completed ? 'success' : 'skipped';
        if (completed || msLeft < getTotalSeconds('focus') * 1000) recordSession('focus', completed);
        updateSessionDots();
        startBreak();
    } else if (state === STATES.BREAK || state === STATES.BREAK_OT) {
        const completed = state === STATES.BREAK_OT;
        stopTicking();
        if (completed || msLeft < getTotalSeconds('break') * 1000) recordSession('break', completed);
        currentSessionNum++;
        if (currentSessionNum > dailySessionGoal) {
            currentSessionNum = 1;
            sessionCompletionStatus = [];
        }
        updateSessionDots();
        updateSessionInfo();
        startFocus();
    }
});

// --- Settings Adjusters ---
document.querySelectorAll('.setting-adj').forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const dir = parseInt(btn.dataset.dir);
        if (target === 'focus') {
            const next = dir > 0 ? Math.floor(settings.focusMin / 5) * 5 + 5 : Math.ceil(settings.focusMin / 5) * 5 - 5;
            settings.focusMin = Math.max(1, Math.min(120, next));
        }
        else if (target === 'break') {
            settings.breakMin = Math.max(1, Math.min(60, settings.breakMin + dir));
        }
        else if (target === 'longbreak') {
            const next = dir > 0 ? Math.floor(settings.longBreakMin / 5) * 5 + 5 : Math.ceil(settings.longBreakMin / 5) * 5 - 5;
            settings.longBreakMin = Math.max(1, Math.min(60, next));
        }
        appData.settings = settings;
        saveData(appData);
        updateSettingsBar();
        if (state === STATES.IDLE) { msLeft = getTotalSeconds('focus') * 1000; timerDisplay.textContent = fmt(msLeft); }
    });
});

document.querySelectorAll('.setting-value-input').forEach(input => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('change', () => {
        const target = input.id.split('-')[1];
        let val = parseInt(input.value) || 1;
        if (target === 'focus') { val = Math.max(1, Math.min(120, val)); settings.focusMin = val; }
        else if (target === 'break') { val = Math.max(1, Math.min(60, val)); settings.breakMin = val; }
        else if (target === 'longbreak') { val = Math.max(1, Math.min(60, val)); settings.longBreakMin = val; }
        input.value = val;
        appData.settings = settings;
        saveData(appData);
        if (state === STATES.IDLE) { msLeft = getTotalSeconds('focus') * 1000; timerDisplay.textContent = fmt(msLeft); }
    });
});

// --- Plant ---

function getPlantStage(totalMinutes, stages) {
    const s = stages || getActiveStages();
    let stage = 0;
    for (let i = s.length - 1; i >= 0; i--) {
        if (totalMinutes >= s[i].minutes) { stage = i; break; }
    }
    return stage;
}

function checkPlantStatus() {
    const today = new Date().toISOString().split('T')[0];
    const plantSessions = appData.sessions.filter(s => s.type === 'focus' && s.completed && (s.startTime || s.date) >= appData.plant.startDate);
    
    if (plantSessions.length > 0) {
        const lastSessionDateStr = plantSessions[plantSessions.length - 1].date;
        const lastDate = new Date(lastSessionDateStr);
        const currDate = new Date(today);
        
        const diffTime = currDate - lastDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 2) {
            alert("Oh no! Your plant withered away because you didn't study yesterday. It has been archived.");
            archivePlant('dead');
        }
    }
}

function archivePlant(status) {
    const plantType = getActivePlantType();
    const plantSessions = appData.sessions.filter(s => s.type === 'focus' && s.completed && (s.startTime || s.date) >= appData.plant.startDate);
    const totalFocusSeconds = plantSessions.reduce((acc, s) => acc + s.actualDuration, 0);
    const totalMinutes = Math.floor(totalFocusSeconds / 60);
    
    const todayStr = new Date().toISOString().split('T')[0];
    const startStr = appData.plant.startDate.split('T')[0];
    const start = new Date(startStr);
    const end = new Date(todayStr);
    const diffDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    
    appData.archive.push({
        status: status,
        totalMinutes: totalMinutes,
        days: diffDays,
        archivedAt: todayStr,
        plantType: appData.plant.type,
        totalHours: plantType.totalHours
    });
    
    appData.plant.startDate = new Date().toISOString();
    appData.plant.stage = 0;
    appData.plant.type = 'oak';
    saveData(appData);
    
    updatePlant();
    if (typeof renderArchive === 'function') renderArchive();
}

function updatePlant() {
    const plantType = getActivePlantType();
    const stages = plantType.stages;
    const totalFocusSeconds = appData.sessions
        .filter(s => s.type === 'focus' && s.completed && (s.startTime || s.date) >= appData.plant.startDate)
        .reduce((acc, s) => acc + s.actualDuration, 0);
    const totalMinutes = Math.floor(totalFocusSeconds / 60);

    const stage = getPlantStage(totalMinutes, stages);
    appData.plant.stage = stage;
    const stageInfo = stages[stage];
    const nextStage = stages[stage + 1];
    const roman = ['I','II','III','IV','V','VI','VII'];

    $('plant-stage-label').textContent = `Stage ${roman[stage]} · ${stageInfo.name}`;
    $('plant-name').textContent = stageInfo.name === 'Seed' ? `Your Study ${plantType.name}` : `Your Study ${stageInfo.name}`;

    // Removed updatePlantSelector call

    if (nextStage) {
        $('harvest-overlay').hidden = true;
        const totalTargetMinutes = plantType.totalHours * 60;
        const progress = (totalMinutes / totalTargetMinutes) * 100;
        $('plant-progress-fill').style.width = Math.min(progress, 100) + '%';
        
        const hoursDone = Math.floor(totalMinutes / 60);
        const minsDone = totalMinutes % 60;
        let doneStr = '';
        if (hoursDone > 0) doneStr += `${hoursDone}h `;
        doneStr += `${minsDone}m`;
        
        const minutesLeft = nextStage.minutes - totalMinutes;
        const hoursLeft = Math.floor(minutesLeft / 60);
        const minsLeft = minutesLeft % 60;
        let timeStr = '';
        if (hoursLeft > 0) timeStr += `${hoursLeft}h `;
        timeStr += `${minsLeft}m`;
        
        $('plant-progress-text').textContent = `${doneStr} / ${plantType.totalHours}h (Next: ${nextStage.name} in ${timeStr})`;
    } else {
        $('harvest-overlay').hidden = false;
        $('plant-progress-fill').style.width = '100%';
        
        const totalHoursDisplay = Math.floor(totalMinutes / 60);
        
        $('plant-progress-text').textContent = `${totalHoursDisplay}/${plantType.totalHours}h (Fully grown!)`;
    }
    drawPlant(stage);
}

function drawPlant(stage) {
    const stem = $('stem-main');
    const leavesG = $('plant-leaves');
    const flowerG = $('plant-flower');
    leavesG.innerHTML = '';
    flowerG.innerHTML = '';
    const type = appData.plant.type || 'oak';
    const colors = getActivePlantType().colors;

    if (type === 'herb') drawHerb(stage, stem, leavesG, flowerG, colors);
    else if (type === 'sunflower') drawSunflower(stage, stem, leavesG, flowerG, colors);
    else if (type === 'rose') drawRose(stage, stem, leavesG, flowerG, colors);
    else if (type === 'cherry') drawCherry(stage, stem, leavesG, flowerG, colors);
    else if (type === 'palm') drawPalm(stage, stem, leavesG, flowerG, colors);
    else drawOak(stage, stem, leavesG, flowerG, colors);
}

function addLeaf(parent, x, y, dir, scale, fill, stroke) {
    fill = fill || '#7A9A4A'; stroke = stroke || '#5B7A3A';
    const leaf = document.createElementNS('http://www.w3.org/2000/svg','path');
    const sx = dir * 20 * scale;
    const sy = -8 * scale;
    leaf.setAttribute('d', `M${x} ${y} Q${x + sx * 0.5} ${y + sy * 1.5} ${x + sx} ${y + sy} Q${x + sx * 0.5} ${y + sy * 0.3} ${x} ${y}`);
    leaf.setAttribute('fill', fill);
    leaf.setAttribute('stroke', stroke);
    leaf.setAttribute('stroke-width', '0.5');
    leaf.style.transformOrigin = `${x}px ${y}px`;
    leaf.style.animation = `sway ${2 + Math.random() * 2}s ease-in-out ${Math.random()}s infinite`;
    parent.appendChild(leaf);
}

// --- Oak (original) ---
function drawOak(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 185, 160, 130, 100, 80];
    const h = heights[Math.min(stage, 5)];
    stem.setAttribute('d', `M100 200 L100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(3 + stage, 7);
    if (stage >= 1) { addLeaf(leavesG, 100, 185, -1, 0.6, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 180, 1, 0.6, c.leaf, c.leafStroke); }
    if (stage >= 2) { addLeaf(leavesG, 100, 165, -1, 0.8, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 158, 1, 0.8, c.leaf, c.leafStroke); }
    if (stage >= 3) { addLeaf(leavesG, 100, 140, -1, 1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 135, 1, 1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 148, -1, 0.7, c.leaf, c.leafStroke); }
    if (stage >= 4) { addLeaf(leavesG, 100, 120, -1, 1.1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 115, 1, 1.1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 128, -1, 0.9, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 125, 1, 0.9, c.leaf, c.leafStroke); }
    if (stage >= 5) {
        addLeaf(leavesG, 100, 100, -1, 1.2, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 95, 1, 1.2, c.leaf, c.leafStroke);
        addLeaf(leavesG, 100, 108, -1, 1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 105, 1, 1, c.leaf, c.leafStroke);
        const cx = 100, cy = h - 8; let fs = '';
        for (let i = 0; i < 5; i++) { const a = (i*72-18)*Math.PI/180; const px=cx+Math.cos(a)*7; const py=cy+Math.sin(a)*7; fs += `<ellipse cx="${px}" cy="${py}" rx="6" ry="4" transform="rotate(${i*72-18} ${px} ${py})" fill="${c.flower}" stroke="#D4CFC4" stroke-width="1"/>`; }
        fs += `<circle cx="${cx}" cy="${cy}" r="4" fill="#E0C872" stroke="#C9A84C" stroke-width="1"/><circle cx="${cx}" cy="${cy}" r="2" fill="#C9A84C" stroke="none"/>`;
        flowerG.innerHTML = fs;
    }
}

// --- Herb ---
function drawHerb(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 188, 165, 145];
    const h = heights[Math.min(stage, 3)];
    stem.setAttribute('d', `M100 200 L100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(2 + stage, 5);
    if (stage >= 1) { addLeaf(leavesG, 100, 190, -1, 0.5, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 188, 1, 0.5, c.leaf, c.leafStroke); }
    if (stage >= 2) {
        addLeaf(leavesG, 100, 178, -1, 0.7, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 175, 1, 0.7, c.leaf, c.leafStroke);
        addLeaf(leavesG, 100, 170, -1, 0.6, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 168, 1, 0.6, c.leaf, c.leafStroke);
    }
    if (stage >= 3) {
        addLeaf(leavesG, 100, 160, -1, 0.9, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 155, 1, 0.9, c.leaf, c.leafStroke);
        addLeaf(leavesG, 100, 150, -1, 0.8, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 148, 1, 0.8, c.leaf, c.leafStroke);
        addLeaf(leavesG, 100, 145, -1, 0.7, '#8BA84A', c.leafStroke); addLeaf(leavesG, 100, 145, 1, 0.7, '#8BA84A', c.leafStroke);
    }
}

// --- Sunflower ---
function drawSunflower(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 185, 150, 110, 75];
    const h = heights[Math.min(stage, 4)];
    stem.setAttribute('d', `M100 200 L100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(3 + stage, 6);
    if (stage >= 1) { addLeaf(leavesG, 100, 185, -1, 0.6, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 182, 1, 0.6, c.leaf, c.leafStroke); }
    if (stage >= 2) { addLeaf(leavesG, 100, 160, -1, 1.1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 155, 1, 1.1, c.leaf, c.leafStroke); }
    if (stage >= 3) { addLeaf(leavesG, 100, 130, -1, 1.2, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 125, 1, 1.2, c.leaf, c.leafStroke); }
    if (stage >= 4) {
        const cx = 100, cy = h - 5; let fs = '';
        for (let i = 0; i < 12; i++) { const a = i*30*Math.PI/180; const px=cx+Math.cos(a)*12; const py=cy+Math.sin(a)*12; fs += `<ellipse cx="${px}" cy="${py}" rx="7" ry="4" transform="rotate(${i*30} ${px} ${py})" fill="${c.flower}" stroke="#D4A020" stroke-width="0.5"/>`; }
        fs += `<circle cx="${cx}" cy="${cy}" r="8" fill="#8B6914" stroke="#6B4E0A" stroke-width="1"/>`;
        for (let i = 0; i < 6; i++) { const a = i*60*Math.PI/180; fs += `<circle cx="${cx+Math.cos(a)*3}" cy="${cy+Math.sin(a)*3}" r="1" fill="#5C4033"/>`; }
        flowerG.innerHTML = fs;
    }
}

// --- Rose ---
function drawRose(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 185, 155, 120, 90];
    const h = heights[Math.min(stage, 4)];
    stem.setAttribute('d', `M100 200 L100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(2 + stage, 5);
    // Thorns
    if (stage >= 2) {
        let thorns = '';
        for (let ty = 195; ty > h + 10; ty -= 12) { thorns += `<path d="M100 ${ty} L${95 + (ty%2)*10} ${ty-4}" stroke="#3A5C2A" stroke-width="1" fill="none"/>`; }
        leavesG.innerHTML += thorns; // thorns first
    }
    if (stage >= 1) { addLeaf(leavesG, 100, 185, -1, 0.5, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 182, 1, 0.5, c.leaf, c.leafStroke); }
    if (stage >= 2) { addLeaf(leavesG, 100, 165, -1, 0.8, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 160, 1, 0.8, c.leaf, c.leafStroke); }
    if (stage >= 3) { addLeaf(leavesG, 100, 135, -1, 0.9, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 130, 1, 0.9, c.leaf, c.leafStroke); }
    if (stage >= 4) {
        const cx = 100, cy = h - 5; let fs = '';
        for (let i = 0; i < 8; i++) { const a = i*45*Math.PI/180; const r = 5 + (i%2)*3; const px=cx+Math.cos(a)*r; const py=cy+Math.sin(a)*r; fs += `<ellipse cx="${px}" cy="${py}" rx="5" ry="3.5" transform="rotate(${i*45} ${px} ${py})" fill="${c.flower}" stroke="#A03040" stroke-width="0.5"/>`; }
        fs += `<circle cx="${cx}" cy="${cy}" r="4" fill="#E04060" stroke="#A03040" stroke-width="0.5"/>`;
        flowerG.innerHTML = fs;
    }
}

// --- Cherry Blossom ---
function drawCherry(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 185, 160, 130, 100, 75];
    const h = heights[Math.min(stage, 5)];
    stem.setAttribute('d', `M100 200 L100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(3 + stage, 8);
    if (stage >= 1) { addLeaf(leavesG, 100, 185, -1, 0.6, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 180, 1, 0.6, c.leaf, c.leafStroke); }
    if (stage >= 2) { addLeaf(leavesG, 100, 165, -1, 0.8, c.leaf, c.leafStroke); addLeaf(leavesG, 100, 158, 1, 0.8, c.leaf, c.leafStroke); }
    if (stage >= 3) {
        // Branches
        let br = `<path d="M100 ${h+30} Q80 ${h+10} 70 ${h+5}" stroke="${c.stem}" stroke-width="3" fill="none"/>`;
        br += `<path d="M100 ${h+30} Q120 ${h+10} 130 ${h+5}" stroke="${c.stem}" stroke-width="3" fill="none"/>`;
        leavesG.innerHTML += br;
        addLeaf(leavesG, 70, h+5, -1, 0.8, c.leaf, c.leafStroke); addLeaf(leavesG, 130, h+5, 1, 0.8, c.leaf, c.leafStroke);
    }
    if (stage >= 4) { addLeaf(leavesG, 100, h+15, -1, 1, c.leaf, c.leafStroke); addLeaf(leavesG, 100, h+15, 1, 1, c.leaf, c.leafStroke); }
    if (stage >= 5) {
        let fs = '';
        const blossomPositions = [[100, h-5], [75, h+2], [125, h+2], [85, h+15], [115, h+15]];
        blossomPositions.forEach(([bx, by]) => {
            for (let i = 0; i < 5; i++) { const a=(i*72-18)*Math.PI/180; const px=bx+Math.cos(a)*5; const py=by+Math.sin(a)*5; fs += `<ellipse cx="${px}" cy="${py}" rx="4" ry="3" transform="rotate(${i*72-18} ${px} ${py})" fill="${c.flower}" stroke="#E8A0B8" stroke-width="0.5"/>`; }
            fs += `<circle cx="${bx}" cy="${by}" r="2.5" fill="#FFE0E8" stroke="#E8A0B8" stroke-width="0.5"/>`;
        });
        flowerG.innerHTML = fs;
    }
}

// --- Palm ---
function drawPalm(stage, stem, leavesG, flowerG, c) {
    const heights = [200, 185, 155, 120, 90, 65];
    const h = heights[Math.min(stage, 5)];
    // Curved trunk
    const midX = stage >= 3 ? 95 : 100;
    stem.setAttribute('d', `M100 200 Q${midX} ${(200+h)/2} 100 ${h}`);
    stem.setAttribute('stroke', c.stem);
    stem.style.strokeWidth = Math.min(4 + stage, 9);
    // Trunk texture
    if (stage >= 2) {
        let tex = '';
        for (let ty = 195; ty > h + 5; ty -= 8) { tex += `<line x1="96" y1="${ty}" x2="104" y2="${ty}" stroke="#7A6345" stroke-width="0.8"/>`; }
        leavesG.innerHTML += tex;
    }
    // Fronds (large drooping leaves)
    if (stage >= 1) { addFrond(leavesG, 100, h, -35, -15, 0.6, c); addFrond(leavesG, 100, h, 35, -15, 0.6, c); }
    if (stage >= 2) { addFrond(leavesG, 100, h, -50, 5, 0.7, c); addFrond(leavesG, 100, h, 50, 5, 0.7, c); }
    if (stage >= 3) { addFrond(leavesG, 100, h, -25, -25, 0.8, c); addFrond(leavesG, 100, h, 25, -25, 0.8, c); }
    if (stage >= 4) { addFrond(leavesG, 100, h, -45, -5, 0.9, c); addFrond(leavesG, 100, h, 45, -5, 0.9, c); addFrond(leavesG, 100, h, 0, -30, 0.7, c); }
    if (stage >= 5) { addFrond(leavesG, 100, h, -55, 10, 1, c); addFrond(leavesG, 100, h, 55, 10, 1, c); addFrond(leavesG, 100, h, -15, -30, 0.8, c); addFrond(leavesG, 100, h, 15, -30, 0.8, c); }
}

function addFrond(parent, x, y, dx, dy, scale, c) {
    const frond = document.createElementNS('http://www.w3.org/2000/svg','path');
    const ex = x + dx * scale; const ey = y + dy * scale;
    const cx1 = x + dx * 0.3 * scale; const cy1 = y + dy * 1.2 * scale;
    frond.setAttribute('d', `M${x} ${y} Q${cx1} ${cy1} ${ex} ${ey}`);
    frond.setAttribute('fill', 'none');
    frond.setAttribute('stroke', c.leaf);
    frond.setAttribute('stroke-width', `${2 * scale}`);
    frond.setAttribute('stroke-linecap', 'round');
    frond.style.transformOrigin = `${x}px ${y}px`;
    frond.style.animation = `sway ${3 + Math.random() * 2}s ease-in-out ${Math.random()}s infinite`;
    parent.appendChild(frond);
    // Small leaflets
    for (let t = 0.3; t <= 0.9; t += 0.2) {
        const lx = x + (ex-x)*t; const ly = y + (ey-y)*t + (dy < 0 ? -2 : 2) * scale;
        const ll = document.createElementNS('http://www.w3.org/2000/svg','line');
        ll.setAttribute('x1', lx); ll.setAttribute('y1', ly);
        ll.setAttribute('x2', lx + (dx > 0 ? 4 : -4) * scale); ll.setAttribute('y2', ly - 3 * scale);
        ll.setAttribute('stroke', c.leaf); ll.setAttribute('stroke-width', '1');
        parent.appendChild(ll);
    }
}

function getPlantSvgString(stage, isDead, plantTypeId) {
    const pt = PLANT_TYPES[plantTypeId] || PLANT_TYPES.oak;
    const maxStages = pt.stages.length;
    const heights = [200, 188, 168, 145, 115, 80];
    const h = heights[Math.min(stage, heights.length - 1)];
    
    const stemColor = isDead ? '#6B5235' : pt.colors.stem;
    const leafFill = isDead ? '#A68B63' : pt.colors.leaf;
    const leafStroke = isDead ? '#8B6F47' : pt.colors.leafStroke;
    
    const stemW = Math.min(3 + stage, 7);
    let svg = `<svg viewBox="0 0 200 260" class="archive-plant-svg">
        <path d="M60 200 L70 250 L130 250 L140 200 Z" fill="#8B6F47" stroke="#6B5235" stroke-width="1.5"/>
        <rect x="55" y="192" width="90" height="12" rx="3" fill="#9B7F57" stroke="#6B5235" stroke-width="1.5"/>
        <ellipse cx="100" cy="200" rx="40" ry="5" fill="#6B5235" opacity="0.3"/>
        <ellipse cx="100" cy="200" rx="38" ry="6" fill="#5C4033"/>
        <path d="M100 200 L100 ${h}" stroke="${stemColor}" stroke-width="${stemW}" stroke-linecap="round" fill="none"/>
    `;
    
    function makeLeaf(x, y, dir, scale) {
        const sx = dir * 20 * scale;
        const sy = -8 * scale;
        let d = `M${x} ${y} Q${x + sx * 0.5} ${y + sy * 1.5} ${x + sx} ${y + sy} Q${x + sx * 0.5} ${y + sy * 0.3} ${x} ${y}`;
        if (isDead) {
            d = `M${x} ${y} Q${x + sx * 0.5} ${y - sy * 1.5} ${x + sx} ${y - sy} Q${x + sx * 0.5} ${y - sy * 0.3} ${x} ${y}`;
        }
        return `<path d="${d}" fill="${leafFill}" stroke="${leafStroke}" stroke-width="0.5"/>`;
    }
    
    if (stage >= 1) { svg += makeLeaf(100, 190, -1, 0.5); svg += makeLeaf(100, 188, 1, 0.5); }
    if (stage >= 2) { svg += makeLeaf(100, 175, -1, 0.7); svg += makeLeaf(100, 170, 1, 0.7); }
    if (stage >= 3) { svg += makeLeaf(100, 155, -1, 0.9); svg += makeLeaf(100, 150, 1, 0.9); }
    if (stage >= 4) { svg += makeLeaf(100, 130, -1, 1); svg += makeLeaf(100, 125, 1, 1); }
    
    // Final stage flower/crown (if not dead)
    if (stage >= maxStages - 1 && !isDead && pt.colors.flower) {
        const cx = 100, cy = h - 8;
        const fc = pt.colors.flower;
        for (let i = 0; i < 5; i++) {
            const a = (i * 72 - 18) * Math.PI / 180;
            const px = cx + Math.cos(a) * 7;
            const py = cy + Math.sin(a) * 7;
            svg += `<ellipse cx="${px}" cy="${py}" rx="6" ry="4" transform="rotate(${i*72-18} ${px} ${py})" fill="${fc}" stroke-width="0.5" stroke="${isDead ? '#888' : '#D4CFC4'}"/>`;
        }
        svg += `<circle cx="${cx}" cy="${cy}" r="3" fill="#E0C872"/>`;
    }
    
    svg += '</svg>';
    return svg;
}

// --- Stats ---
function openStats() {
    updateStatsContent();
    const modal = $('stats-modal');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeStats() {
    const modal = $('stats-modal');
    modal.classList.remove('visible');
    setTimeout(() => { modal.hidden = true; }, 300);
}

function updateStatsContent() {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = appData.sessions.filter(s => s.date === today);
    const focusToday = todaySessions.filter(s => s.type === 'focus');
    const breakToday = todaySessions.filter(s => s.type === 'break');
    const focusTime = focusToday.reduce((a, s) => a + s.actualDuration, 0);
    const focusOT = focusToday.reduce((a, s) => a + s.overtime, 0);
    const breakTime = breakToday.reduce((a, s) => a + s.actualDuration, 0);

    $('stat-today-focus').textContent = fmtDuration(focusTime);
    $('stat-today-sessions').textContent = focusToday.length;
    $('stat-today-overtime').textContent = fmtDuration(focusOT);
    $('stat-today-breaks').textContent = fmtDuration(breakTime);

    // Week
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekSessions = appData.sessions.filter(s => s.date >= weekStartStr);
    const weekFocus = weekSessions.filter(s => s.type === 'focus');
    const weekBreaks = weekSessions.filter(s => s.type === 'break');

    $('stat-week-focus').textContent = fmtDuration(weekFocus.reduce((a, s) => a + s.actualDuration, 0));
    $('stat-week-sessions').textContent = weekFocus.length;
    $('stat-week-overtime').textContent = fmtDuration(weekFocus.reduce((a, s) => a + s.overtime, 0));
    $('stat-week-breaks').textContent = fmtDuration(weekBreaks.reduce((a, s) => a + s.actualDuration, 0));

    // Weekly chart
    const chart = $('weekly-chart');
    chart.innerHTML = '';
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dailyTotals = days.map((_, i) => {
        const d = new Date(weekStart); d.setDate(d.getDate() + i);
        const ds = d.toISOString().split('T')[0];
        const daySess = appData.sessions.filter(s => s.date === ds && s.type === 'focus');
        return { planned: daySess.reduce((a, s) => a + s.plannedDuration, 0), overtime: daySess.reduce((a, s) => a + s.overtime, 0) };
    });
    const maxTotal = Math.max(1, ...dailyTotals.map(d => d.planned + d.overtime));

    days.forEach((day, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'chart-bar-wrapper';
        const track = document.createElement('div');
        track.className = 'chart-bar-track';
        const barOT = document.createElement('div');
        barOT.className = 'chart-bar-overtime';
        barOT.style.height = (dailyTotals[i].overtime / maxTotal * 100) + '%';
        const bar = document.createElement('div');
        bar.className = 'chart-bar';
        bar.style.height = (dailyTotals[i].planned / maxTotal * 100) + '%';
        track.appendChild(barOT);
        track.appendChild(bar);
        const label = document.createElement('span');
        label.className = 'chart-label';
        label.textContent = day;
        wrapper.appendChild(track);
        wrapper.appendChild(label);
        chart.appendChild(wrapper);
    });

    // Recent sessions
    const history = $('session-history');
    history.innerHTML = '';
    const recent = appData.sessions.slice(-10).reverse();
    if (recent.length === 0) {
        history.innerHTML = '<div class="history-empty">No sessions yet. Start studying!</div>';
    } else {
        recent.forEach((s, displayIdx) => {
            const realIdx = appData.sessions.length - 1 - displayIdx;
            const item = document.createElement('div');
            item.className = 'history-item';
            const otMin = Math.floor(s.overtime / 60);
            const plannedMin = Math.floor(s.plannedDuration / 60);
            const workedMin = Math.floor((s.actualDuration - s.overtime) / 60);
            const time = new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            item.innerHTML = `
                <span class="history-type ${s.type}">${s.type}</span>
                <span class="history-duration">${workedMin}/${plannedMin}m</span>
                <span class="history-overtime">+${otMin}</span>
                <span class="history-time">${s.date} ${time}</span>
            `;
            const delBtn = document.createElement('button');
            delBtn.className = 'history-delete';
            delBtn.title = 'Delete session';
            delBtn.innerHTML = '&times;';
            delBtn.addEventListener('click', () => {
                const removed = appData.sessions[realIdx];
                appData.sessions.splice(realIdx, 1);
                updatePlant();
                saveData(appData);
                updateStatsContent();
            });
            item.appendChild(delBtn);
            history.appendChild(item);
        });
    }
}

$('btn-stats').addEventListener('click', openStats);
$('btn-close-stats').addEventListener('click', closeStats);
$('stats-modal').addEventListener('click', e => { if (e.target === $('stats-modal')) closeStats(); });

$('btn-clear-all').addEventListener('click', () => {
    $('btn-clear-all').hidden = true;
    $('clear-confirm').hidden = false;
    setTimeout(() => {
        const modalContent = $('stats-modal').querySelector('.modal-content');
        if (modalContent) modalContent.scrollTo({ top: modalContent.scrollHeight, behavior: 'smooth' });
    }, 50);
});

$('btn-clear-no').addEventListener('click', () => {
    $('clear-confirm').hidden = true;
    $('btn-clear-all').hidden = false;
});

$('btn-clear-yes').addEventListener('click', () => {
    appData.sessions = [];
    appData.archive = [];
    appData.plant = { startDate: new Date().toISOString(), type: 'oak', stage: 0 };
    saveData(appData);
    updatePlant();
    updateStatsContent();
    if (typeof renderArchive === 'function') renderArchive();
    $('clear-confirm').hidden = true;
    $('btn-clear-all').hidden = false;
});

// --- Settings Modal ---
$('btn-settings').addEventListener('click', () => {
    $('input-focus').value = settings.focusMin;
    $('input-break').value = settings.breakMin;
    $('input-longbreak').value = settings.longBreakMin;
    $('input-sessions').value = sessionsBeforeLong;
    $('input-daily-goal').value = dailySessionGoal;
    $('input-pip-style').value = settings.pipStyle || 'minimal';
    
    const hasPipSupport = 'documentPictureInPicture' in window;
    const optPipApi = $('opt-pip-api');
    const unsupportedNote = $('pip-unsupported-note');
    if (!hasPipSupport) {
        optPipApi.disabled = true;
        optPipApi.title = 'Your browser does not support the modern Picture-in-Picture API.';
        if (unsupportedNote) unsupportedNote.hidden = false;
        if (!settings.pipMethod || settings.pipMethod === 'pip') settings.pipMethod = 'popup';
    } else {
        if (unsupportedNote) unsupportedNote.hidden = true;
    }
    $('input-pip-method').value = settings.pipMethod || (hasPipSupport ? 'pip' : 'popup');
    
    const modal = $('settings-modal');
    modal.hidden = false;
    requestAnimationFrame(() => modal.classList.add('visible'));
});

$('btn-close-settings').addEventListener('click', () => {
    const modal = $('settings-modal');
    modal.classList.remove('visible');
    setTimeout(() => { modal.hidden = true; }, 300);
});

$('settings-modal').addEventListener('click', e => { if (e.target === $('settings-modal')) $('btn-close-settings').click(); });

$('btn-save-settings').addEventListener('click', () => {
    settings.focusMin = Math.max(1, Math.min(120, parseInt($('input-focus').value) || 30));
    settings.breakMin = Math.max(1, Math.min(60, parseInt($('input-break').value) || 5));
    settings.longBreakMin = Math.max(1, Math.min(60, parseInt($('input-longbreak').value) || 15));
    sessionsBeforeLong = Math.max(2, Math.min(10, parseInt($('input-sessions').value) || 4));
    settings.sessionsBeforeLong = sessionsBeforeLong;
    dailySessionGoal = Math.max(1, Math.min(20, parseInt($('input-daily-goal').value) || 4));
    settings.dailySessionGoal = dailySessionGoal;
    settings.pipStyle = $('input-pip-style').value || 'minimal';
    settings.pipMethod = $('input-pip-method').value || ('documentPictureInPicture' in window ? 'pip' : 'popup');
    appData.settings = settings;
    saveData(appData);
    updateSettingsBar();
    updateSessionDots();
    updateSessionInfo();
    if (state === STATES.IDLE) timerDisplay.textContent = fmt(getTotalSeconds('focus') * 1000);
    $('btn-close-settings').click();
});

// --- Export / Import ---
$('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'study-grove-data.json'; a.click();
    URL.revokeObjectURL(url);
});

$('btn-import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const imported = JSON.parse(ev.target.result);
            if (imported.sessions && imported.settings) {
                appData = imported;
                settings = appData.settings;
                sessionsBeforeLong = settings.sessionsBeforeLong || 4;
                saveData(appData);
                updateSettingsBar();
                updatePlant();
                alert('Data imported successfully!');
            } else { alert('Invalid data file.'); }
        } catch { alert('Failed to parse file.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// --- Archive Modal ---
const archiveModal = $('archive-modal');
$('btn-archive').addEventListener('click', () => {
    renderArchive();
    archiveModal.hidden = false;
    requestAnimationFrame(() => archiveModal.classList.add('visible'));
});
$('btn-close-archive').addEventListener('click', () => {
    archiveModal.classList.remove('visible');
    setTimeout(() => archiveModal.hidden = true, 300);
});
archiveModal.addEventListener('click', e => { 
    if (e.target === archiveModal) {
        archiveModal.classList.remove('visible');
        setTimeout(() => archiveModal.hidden = true, 300);
    }
});

function renderArchive() {
    const grid = $('archive-grid');
    grid.innerHTML = '';
    
    if (appData.archive.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; color: var(--color-text-muted);">Your archive is empty. Grow a plant to 25h or neglect one to see it here!</p>';
        return;
    }
    
    // Sort newest first
    const sortedArchive = [...appData.archive].sort((a, b) => new Date(b.archivedAt) - new Date(a.archivedAt));
    
    sortedArchive.forEach(plant => {
        const isCompleted = plant.status === 'completed';
        const hours = Math.floor(plant.totalMinutes / 60);
        const pTypeId = plant.plantType || 'oak';
        const pType = PLANT_TYPES[pTypeId] || PLANT_TYPES.oak;
        const stage = getPlantStage(plant.totalMinutes, pType.stages);
        const plantSvg = getPlantSvgString(stage, !isCompleted, pTypeId);
        const daysText = plant.days === 1 ? 'day' : 'days';
        const plantName = pType.stages[stage] ? pType.stages[stage].name : pType.name;
        const totalH = plant.totalHours || pType.totalHours;
        
        const card = document.createElement('div');
        card.className = `archive-card ${isCompleted ? 'completed' : 'dead'}`;
        card.innerHTML = `
            <div class="archive-name">${plantName}</div>
            <div class="archive-icon">${plantSvg}</div>
            <div class="archive-time">${hours}/${totalH}h</div>
            <div class="archive-days">in ${plant.days} ${daysText}</div>
        `;
        grid.appendChild(card);
    });
}

$('btn-harvest').addEventListener('click', () => {
    const plantName = getActivePlantType().name;
    archivePlant('completed');
    alert(`Congratulations! Your ${plantName} has been harvested and moved to the Archive.`);

});

// --- Audio ---
function playBell() {
    try {
        const audio = $('audio-bell');
        audio.currentTime = 0;
        audio.play().catch(() => {});
    } catch {}
}

// --- Plant Type Selector ---
function initPlantSelector() {
    const container = $('plant-type-selector');
    if (!container) return;
    
    container.innerHTML = '';
    
    Object.values(PLANT_TYPES).forEach(pt => {
        const btn = document.createElement('button');
        btn.className = `plant-type-btn ${pt.id === appData.plant.type ? 'active' : ''}`;
        btn.dataset.type = pt.id;
        
        btn.innerHTML = `
            <span class="pt-icon">${pt.icon}</span>
            <span class="pt-name">${pt.name}</span>
            <span class="pt-hours">(${pt.totalHours}h)</span>
        `;
        
        btn.addEventListener('click', () => {
            if (pt.id === appData.plant.type) return;
            
            const ptInfo = getActivePlantType();
            const plantSessions = appData.sessions.filter(s => s.type === 'focus' && s.completed && (s.startTime || s.date) >= appData.plant.startDate);
            const totalMinutes = Math.floor(plantSessions.reduce((acc, s) => acc + s.actualDuration, 0) / 60);
            const isFullyGrown = totalMinutes >= ptInfo.totalHours * 60;
            const hasProgress = totalMinutes > 0 || appData.plant.stage > 0;
            
            if (isFullyGrown) {
                archivePlant('completed');
            } else if (hasProgress) {
                const confirmDie = confirm(`Are you sure you want to change your seed?\n\nYour current plant has already started growing. If you change the seed now, your current plant will wither and die, and it will be added to your archive.`);
                if (!confirmDie) return;
                
                archivePlant('dead');
            }
            
            appData.plant.type = pt.id;
            saveData(appData);
            
            // Update active styling
            document.querySelectorAll('.plant-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Re-render
            updatePlant();
        });
        
        container.appendChild(btn);
    });
}



// --- Init ---
function init() {
    sessionsBeforeLong = settings.sessionsBeforeLong || 4;
    dailySessionGoal = settings.dailySessionGoal || 4;
    initRing();
    updateSettingsBar();
    updateSessionDots();
    updateSessionInfo();
    checkPlantStatus();
    initPlantSelector();
    updatePlant();
    timerDisplay.textContent = fmt(getTotalSeconds('focus') * 1000);
    setRingProgress(0);
    updateButton();
}

init();

// --- Picture-in-Picture Mini Timer ---
let pipWindow = null;
let pipUpdateInterval = null;
const PIP_CIRC = 2 * Math.PI * 54;
const PIP_REPLICA_CIRC = 2 * Math.PI * 120;

$('btn-pip').addEventListener('click', async () => {
    if (pipWindow && !pipWindow.closed) { pipWindow.close(); pipWindow = null; return; }
    
    const pipStyle = settings.pipStyle || 'minimal';
    const isFull = pipStyle === 'full';
    const isReplica = pipStyle === 'replica';
    
    try {
        let w = 280, h = 160;
        if (isFull) { w = 320; h = 340; }
        if (isReplica) { w = 380; h = 480; }
        
        const pipMethod = settings.pipMethod || ('documentPictureInPicture' in window ? 'pip' : 'popup');
        
        if (pipMethod === 'pip' && 'documentPictureInPicture' in window) {
            pipWindow = await documentPictureInPicture.requestWindow({ width: w, height: h });
        } else {
            pipWindow = window.open('', 'StudyGrovePiP', `width=${w},height=${h},menubar=no,toolbar=no,location=no,status=no,resizable=yes`);
            if (!pipWindow) {
                alert('Please allow pop-ups to use the mini timer in this browser.');
                return;
            }
            // Clear any existing content if the window was already open
            pipWindow.document.body.innerHTML = '';
            pipWindow.document.head.innerHTML = '';
        }
        
        const pipDoc = pipWindow.document;
        pipDoc.title = 'Study Grove Timer';
        
        const style = pipDoc.createElement('style');
        style.textContent = getPipStyles(pipStyle);
        pipDoc.head.appendChild(style);
        
        if (isReplica) pipDoc.body.innerHTML = getPipReplicaHTML();
        else if (isFull) pipDoc.body.innerHTML = getPipFullHTML();
        else pipDoc.body.innerHTML = getPipMinimalHTML();
        
        // Wire buttons
        pipDoc.getElementById('pip-play').addEventListener('click', () => btnStart.click());
        pipDoc.getElementById('pip-skip').addEventListener('click', () => $('btn-skip').click());
        pipDoc.getElementById('pip-skip-back').addEventListener('click', () => $('btn-reset').click());
        
        // Init ring
        if (isFull || isReplica) {
            const ring = pipDoc.getElementById('pip-ring-progress');
            const circ = isReplica ? PIP_REPLICA_CIRC : PIP_CIRC;
            ring.style.strokeDasharray = circ;
            ring.style.strokeDashoffset = circ;
        }
        
        updatePipDisplay();
        pipUpdateInterval = setInterval(updatePipDisplay, 200);
        
        const cleanup = () => {
            if (pipUpdateInterval) clearInterval(pipUpdateInterval);
            pipUpdateInterval = null;
            pipWindow = null;
        };
        pipWindow.addEventListener('pagehide', cleanup);
        pipWindow.addEventListener('unload', cleanup);
    } catch (err) { console.error('PiP error:', err); }
});

function getPipMinimalHTML() {
    return `
        <div class="pip-mode"><span class="pip-dot"></span><span id="pip-mode-text">FOCUS</span></div>
        <div class="pip-time" id="pip-time">00:00</div>
        <div class="pip-controls">
            <button class="pip-btn" id="pip-skip-back" title="Reset"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 1 9 9"/><polyline points="3 3 3 12 12 12"/></svg></button>
            <button class="pip-btn pip-btn-play" id="pip-play" title="Start/Pause"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="6 4 20 12 6 20 6 4"/></svg></button>
            <button class="pip-btn" id="pip-skip" title="Skip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></button>
        </div>
    `;
}

function getPipFullHTML() {
    return `
        <div class="pip-ring-wrap">
            <svg class="pip-ring-svg" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(234,228,211,0.12)" stroke-width="5"/>
                <circle id="pip-ring-progress" cx="60" cy="60" r="54" fill="none" stroke="#8B9A6B" stroke-width="5" stroke-linecap="round" transform="rotate(-90 60 60)"/>
            </svg>
            <div class="pip-ring-inner">
                <div class="pip-mode"><span class="pip-dot"></span><span id="pip-mode-text">FOCUS</span></div>
                <div class="pip-time" id="pip-time">00:00</div>
                <div class="pip-session" id="pip-session">Session I of IV</div>
            </div>
        </div>
        <div class="pip-controls">
            <button class="pip-btn" id="pip-skip-back" title="Reset"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 1 9 9"/><polyline points="3 3 3 12 12 12"/></svg></button>
            <button class="pip-btn pip-btn-play" id="pip-play" title="Start/Pause"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="6 4 20 12 6 20 6 4"/></svg></button>
            <button class="pip-btn" id="pip-skip" title="Skip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></button>
        </div>
    `;
}

function getPipReplicaHTML() {
    let ticks = '';
    for (let i = 0; i < 60; i++) {
        const angle = (i * 6) * Math.PI / 180;
        const isMajor = i % 5 === 0;
        const r1 = isMajor ? 130 : 133;
        const r2 = 138;
        const x1 = 140 + r1 * Math.cos(angle), y1 = 140 + r1 * Math.sin(angle);
        const x2 = 140 + r2 * Math.cos(angle), y2 = 140 + r2 * Math.sin(angle);
        const opacity = isMajor ? '0.6' : '0.3';
        ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#2D3B2D" stroke-width="2" opacity="${opacity}"/>`;
    }
    
    return `
        <div class="pip-ring-wrap" style="width: 280px; height: 280px;">
            <svg class="pip-ring-svg" viewBox="0 0 280 280">
                ${ticks}
                <circle cx="140" cy="140" r="120" fill="none" stroke="rgba(45,59,45,0.1)" stroke-width="3"/>
                <circle id="pip-ring-progress" cx="140" cy="140" r="120" fill="none" stroke="#8B9A6B" stroke-width="4" stroke-linecap="round" transform="rotate(-90 140 140)"/>
            </svg>
            <div class="pip-ring-inner">
                <div class="pip-mode-replica"><span class="pip-dot"></span><span id="pip-mode-text">FOCUS</span></div>
                <div class="pip-time-replica" id="pip-time">00:00</div>
                <div class="pip-session-replica" id="pip-session">Session I of IV</div>
            </div>
        </div>
        <div class="pip-controls-replica">
            <button class="pip-btn-secondary" id="pip-skip-back" title="Reset"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 1 9 9"/><polyline points="3 3 3 12 12 12"/></svg></button>
            <button class="pip-btn-primary" id="pip-play" title="Start/Pause">START</button>
            <button class="pip-btn-secondary" id="pip-skip" title="Skip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" y1="5" x2="19" y2="19"/></svg></button>
        </div>
    `;
}

function getPipStyles(pipStyle) {
    const isReplica = pipStyle === 'replica';
    const isFull = pipStyle === 'full';
    
    let css = `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;600&family=Outfit:wght@400;500;600&display=swap');
        body {
            font-family: 'Inter', sans-serif;
            background: ${isReplica ? '#EAE4D3' : '#2D3B2D'};
            color: ${isReplica ? '#2D3B2D' : '#EAE4D3'};
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            user-select: none;
            overflow: hidden;
            padding: 12px;
            gap: 8px;
            transition: background 0.3s ease;
        }
    `;
    
    if (!isReplica) {
        css += `
            body.break-mode { background: #2D3545; }
            body.overtime-mode { background: #3B3520; }
            .pip-mode {
                font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.12em;
                opacity: 0.7; font-weight: 600;
            }
            .pip-mode .pip-dot {
                display: inline-block; width: 6px; height: 6px; border-radius: 50%;
                background: #8B9A6B; margin-right: 4px; vertical-align: middle;
            }
            body.break-mode .pip-dot { background: #6B8FA8; }
            body.overtime-mode .pip-dot { background: #C9A84C; }
            .pip-time {
                font-family: 'Space Mono', monospace; font-weight: 700;
                letter-spacing: -0.02em; line-height: 1; font-size: ${isFull ? '1.6rem' : '2.8rem'};
            }
            .pip-controls { display: flex; gap: 8px; align-items: center; }
            .pip-btn {
                display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;
                border: 1px solid rgba(234,228,211,0.3); border-radius: 6px; background: rgba(255,255,255,0.08);
                color: #EAE4D3; cursor: pointer; transition: background 0.15s;
            }
            .pip-btn:hover { background: rgba(255,255,255,0.18); }
            .pip-btn svg { width: 14px; height: 14px; }
            .pip-btn-play {
                width: 40px; height: 30px; background: rgba(139,154,107,0.3); border-color: rgba(139,154,107,0.5);
            }
            .pip-btn-play:hover { background: rgba(139,154,107,0.5); }
        `;
    } else {
        // Replica Styles
        css += `
            .pip-mode-replica {
                display: flex; align-items: center; justify-content: center; gap: 6px;
                padding: 4px 12px; background: rgba(255,255,255,0.5);
                border: 1px solid rgba(45,59,45,0.15); border-radius: 20px;
                font-size: 0.7rem; font-weight: 600; letter-spacing: 0.1em;
                color: #5A6B4A; margin-bottom: 8px;
            }
            .pip-dot { width: 6px; height: 6px; border-radius: 50%; background: #8B9A6B; }
            body.break-mode .pip-dot { background: #6B8FA8; }
            body.overtime-mode .pip-dot { background: #C9A84C; }
            .pip-time-replica {
                font-family: 'Outfit', sans-serif; font-size: 4rem; font-weight: 600;
                color: #2D3B2D; line-height: 1; letter-spacing: -0.03em;
            }
            .pip-session-replica {
                font-size: 0.8rem; font-weight: 500; letter-spacing: 0.15em;
                color: #8A9180; text-transform: uppercase; margin-top: 4px;
            }
            .pip-controls-replica {
                display: flex; gap: 16px; margin-top: 32px; align-items: center;
            }
            .pip-btn-primary {
                background: #5A6B4A; color: #FFF; font-size: 0.9rem; font-weight: 600;
                letter-spacing: 0.08em; padding: 12px 32px; border-radius: 6px;
                border: none; cursor: pointer; min-width: 120px;
            }
            .pip-btn-primary:hover { background: #4A5A4A; }
            .pip-btn-secondary {
                width: 42px; height: 42px; border: 1.5px solid rgba(45,59,45,0.2);
                border-radius: 6px; background: rgba(255,255,255,0.5); color: #5A6B4A;
                cursor: pointer; display: flex; align-items: center; justify-content: center;
            }
            .pip-btn-secondary:hover { border-color: #8B9A6B; background: rgba(139,154,107,0.1); }
            .pip-btn-secondary svg { width: 18px; height: 18px; }
        `;
    }
    
    if (isFull || isReplica) {
        css += `
            .pip-ring-wrap { position: relative; }
            ${isFull ? '.pip-ring-wrap { width: 200px; height: 200px; }' : ''}
            .pip-ring-svg { width: 100%; height: 100%; }
            #pip-ring-progress { transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease; }
            body.break-mode #pip-ring-progress { stroke: #8BB0C9; }
            body.overtime-mode #pip-ring-progress { stroke: #C9A84C; }
            .pip-ring-inner {
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                display: flex; flex-direction: column; align-items: center; justify-content: center;
            }
        `;
    }
    
    return css;
}

function updatePipDisplay() {
    if (!pipWindow || pipWindow.closed) {
        if (pipUpdateInterval) clearInterval(pipUpdateInterval);
        pipUpdateInterval = null; pipWindow = null; return;
    }
    
    const pipStyle = settings.pipStyle || 'minimal';
    const isReplica = pipStyle === 'replica';
    
    const pipDoc = pipWindow.document;
    const timeEl = pipDoc.getElementById('pip-time');
    const modeEl = pipDoc.getElementById('pip-mode-text');
    const playBtn = pipDoc.getElementById('pip-play');
    if (!timeEl) return;
    
    // Time
    if (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) {
        timeEl.textContent = '+' + fmt(overtimeMs).replace('+','');
    } else if (state === STATES.IDLE) {
        timeEl.textContent = fmt(getTotalSeconds('focus') * 1000);
    } else {
        timeEl.textContent = fmt(msLeft);
    }
    
    // Mode
    if (state === STATES.FOCUS || state === STATES.FOCUS_OT) modeEl.textContent = state === STATES.FOCUS_OT ? 'OVERTIME' : 'FOCUS';
    else if (state === STATES.BREAK || state === STATES.BREAK_OT) modeEl.textContent = state === STATES.BREAK_OT ? 'OVERTIME' : 'BREAK';
    else modeEl.textContent = 'FOCUS';
    
    // Body color
    pipDoc.body.classList.remove('break-mode', 'overtime-mode');
    if (state === STATES.BREAK || state === STATES.BREAK_OT) pipDoc.body.classList.add('break-mode');
    if (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) pipDoc.body.classList.add('overtime-mode');
    
    // Play/pause icon (or text)
    if (isReplica) {
        if (timerInterval) {
            playBtn.textContent = 'PAUSE';
        } else {
            playBtn.textContent = state === STATES.IDLE ? 'START' : 'RESUME';
        }
    } else {
        if (timerInterval) {
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
            playBtn.title = 'Pause';
        } else {
            playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
            playBtn.title = state === STATES.IDLE ? 'Start' : 'Resume';
        }
    }
    
    // Full/Replica mode: ring + session
    const ring = pipDoc.getElementById('pip-ring-progress');
    if (ring) {
        let progress = 0;
        if (state === STATES.IDLE) {
            progress = 0;
        } else if (state === STATES.FOCUS) {
            progress = (msLeft / (getTotalSeconds('focus') * 1000));
        } else if (state === STATES.BREAK) {
            const isLong = (currentSessionNum % sessionsBeforeLong === 0);
            progress = (msLeft / (getTotalSeconds(isLong ? 'longbreak' : 'break') * 1000));
        } else if (state === STATES.FOCUS_OT || state === STATES.BREAK_OT) {
            progress = 1;
        }
        
        const circ = isReplica ? PIP_REPLICA_CIRC : PIP_CIRC;
        ring.style.strokeDashoffset = circ * (1 - Math.max(0, Math.min(1, progress)));
    }
    
    const sessionEl = pipDoc.getElementById('pip-session');
    if (sessionEl) {
        const roman = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
        const cur = roman[Math.min(currentSessionNum - 1, 9)] || currentSessionNum;
        const tot = roman[Math.min(sessionsBeforeLong - 1, 9)] || sessionsBeforeLong;
        sessionEl.textContent = `Session ${cur} of ${tot}`;
    }
}


document.addEventListener('keydown', (e) => {
    // Shift + P: Jump to the next plant stage (for testing)
    if (e.shiftKey && e.key === 'P') {
        const stages = getActiveStages();
        const currentStage = appData.plant.stage || 0;
        const nextStageInfo = stages[currentStage + 1];
        
        if (nextStageInfo) {
            const totalFocusSeconds = appData.sessions
                .filter(s => s.type === 'focus' && s.completed && (s.startTime || s.date) >= appData.plant.startDate)
                .reduce((acc, s) => acc + s.actualDuration, 0);
            const totalMinutes = Math.floor(totalFocusSeconds / 60);
            const neededMinutes = nextStageInfo.minutes - totalMinutes;
            
            if (neededMinutes > 0) {
                appData.sessions.push({
                    date: new Date().toISOString().split('T')[0],
                    startTime: new Date().toISOString(),
                    type: 'focus',
                    plannedDuration: neededMinutes * 60,
                    actualDuration: neededMinutes * 60,
                    overtime: 0,
                    completed: true
                });
                updatePlant();
                updateStatsContent();
                saveData(appData);
            }
        }
    }
});

})();
