// เครื่องสร้างเสียงดนตรีและเอฟเฟกต์ในตัว (Web Audio Synthesizer) ป้องกันปัญหาเบราว์เซอร์บล็อกเสียงภายนอก
class SoundSynth {
    constructor() {
        this.ctx = null;
        this.beatInterval = null;
        this.musicPlaying = false;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    beep(freq = 440, duration = 0.1, type = 'sine') {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    correct() {
        this.init();
        const now = this.ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; // คอร์ดเสียงใสเมื่อตอบถูก
        freqs.forEach((f, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, now + (index * 0.08));
            gain.gain.setValueAtTime(0.08, now + (index * 0.08));
            gain.gain.exponentialRampToValueAtTime(0.0001, now + (index * 0.08) + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + (index * 0.08));
            osc.stop(now + (index * 0.08) + 0.35);
        });
    }

    wrong() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.linearRampToValueAtTime(70, now + 0.35);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    }

    startMusic() {
        this.init();
        if (this.musicPlaying) return;
        this.musicPlaying = true;
        
        let step = 0;
        const melody = [329.63, 349.23, 392.00, 392.00, 392.00, 440.00, 349.23, 329.63, 261.63, 293.66, 329.63, 329.63];
        
        this.beatInterval = setInterval(() => {
            if (step % 4 === 0) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.frequency.setValueAtTime(75, this.ctx.currentTime);
                osc.frequency.linearRampToValueAtTime(35, this.ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.18);
            }
            
            if (step % 2 === 0) {
                const note = melody[Math.floor(step / 2) % melody.length];
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(note / 2, this.ctx.currentTime);
                gain.gain.setValueAtTime(0.02, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start();
                osc.stop(this.ctx.currentTime + 0.4);
            }
            step++;
        }, 320);
    }

    stopMusic() {
        if (this.beatInterval) {
            clearInterval(this.beatInterval);
        }
        this.musicPlaying = false;
    }
}

const synth = new SoundSynth();

// การบริหารจัดการตัวแปรสถานะเกม
let currentIdx = 0;
let score = 0;
let active = false;
let controlMode = 'mouse';
let cameraStarted = false;
let pose = null;
let camera = null;
let playMusic = true;

// ระบบจัดการนาฬิกาจับเวลาสะสม
let timerInterval = null;
let secondsElapsed = 0;

const video = document.querySelector('.input_video');
const canvas = document.querySelector('.output_canvas');
const ctx = canvas.getContext('2d');

// พิกัดวงกลม ก ข ค ง ทั้ง 4 มุมจอภาพ บนขนาด Canvas 800x600 (เป็นจุดตรวจจับท่าทางที่เป็นอิสระจากปุ่มภายนอก)
const targetZones = [
    { id: 0, label: "ก", x: 120, y: 160, radius: 75, color: "#10b981" }, // บนซ้าย
    { id: 1, label: "ข", x: 680, y: 160, radius: 75, color: "#06b6d4" }, // บนขวา
    { id: 2, label: "ค", x: 120, y: 440, radius: 75, color: "#f59e0b" }, // ล่างซ้าย
    { id: 3, label: "ง", x: 680, y: 440, radius: 75, color: "#a855f7" }  // ล่างขวา
];

let hoveredZoneIndex = -1;
let hoverStartTime = null;
const HOVER_THRESHOLD = 1500; // ลงคะแนนเมื่อค้างมือครบ 1.5 วินาที

function initCameraSystem() {
    if (pose && camera) return true;
    
    const aiLoading = document.getElementById('ai-loading');
    aiLoading.classList.remove('hidden');

    try {
        if (typeof Pose === 'undefined' || typeof Camera === 'undefined') {
            alert('ระบบกำลังโหลดส่วนเชื่อมโยง AI ตรวจสอบมือกรุณารอสักครู่แล้วเริ่มใหม่อีกครั้งครับ');
            aiLoading.classList.add('hidden');
            return false;
        }

        pose = new Pose({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        pose.onResults(onResults);

        camera = new Camera(video, {
            onFrame: async () => {
                if (controlMode === 'camera' && pose) {
                    await pose.send({ image: video });
                }
            },
            width: 800,
            height: 600
        });

        aiLoading.classList.add('hidden');
        return true;
    } catch (error) {
        console.error('Pose camera initialization failed:', error);
        aiLoading.classList.add('hidden');
        return false;
    }
}

function selectMode(mode) {
    synth.beep(523.25, 0.15);
    controlMode = mode;
    
    const hintText = document.getElementById('control-hint');
    const choices = document.querySelectorAll('.choice-btn');
    
    if (mode === 'camera') {
        const isReady = initCameraSystem();
        if (!isReady) return;

        hintText.innerHTML = "🎥 <b>โหมดกล้อง AI:</b> ยื่นข้อมือซ้ายหรือขวา ไปทับช่อง ก ข ค ง บนจอกล้องและค้างไว้ 1.5 วินาทีเพื่อตอบ";
        choices.forEach(btn => btn.classList.remove('hover:bg-opacity-95', 'active:translate-y-1'));
        
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        
        if (playMusic) synth.startMusic();

        if (!cameraStarted && camera) {
            camera.start();
            cameraStarted = true;
        }
    } else {
        hintText.innerHTML = "🖱️ <b>โหมดเมาส์:</b> นำเมาส์ชี้และคลิกปุ่มตัวเลือก ก ข ค ง ด้านล่างจอภาพได้ทันทีครับ";
        choices.forEach(btn => btn.classList.add('hover:bg-opacity-95', 'active:translate-y-1'));
        
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        
        if (playMusic) synth.startMusic();

        if (cameraStarted && camera) {
            camera.stop();
            cameraStarted = false;
        }
    }
    initGame();
}

function showInstructions() {
    synth.beep(440, 0.1);
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('instruction-screen').classList.remove('hidden');
}

function showMainMenu() {
    synth.beep(392, 0.15);
    stopTimer();
    synth.stopMusic();
    document.getElementById('instruction-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
    
    if (cameraStarted && camera) {
        camera.stop();
        cameraStarted = false;
    }
}

function toggleMusic() {
    synth.beep(440, 0.1);
    playMusic = !playMusic;
    const btn = document.getElementById('music-btn');
    if (playMusic) {
        synth.startMusic();
        btn.innerText = "🎵 ปิดดนตรี";
    } else {
        synth.stopMusic();
        btn.innerText = "🔇 เปิดดนตรี";
    }
}

function initGame() {
    currentIdx = 0;
    score = 0;
    document.getElementById('score').innerText = score;
    startTimer();
    loadNext();
}

function restartGame() {
    synth.beep(523.25, 0.15);
    document.getElementById('summary-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    selectMode(controlMode);
}

function loadNext() {
    if (currentIdx >= mathData.length) {
        endGame();
        return;
    }
    
    const q = mathData[currentIdx];
    document.getElementById('question-text').innerText = q.q;
    
    // ตั้งค่าข้อความให้ปุ่ม ก ข ค ง เสมอ
    for (let i = 0; i < 4; i++) {
        const btnText = document.querySelector(`#choice-${i} .choice-text`);
        btnText.innerText = q.choices[i];
    }
    
    hoveredZoneIndex = -1;
    hoverStartTime = null;

    setTimeout(() => {
        active = true;
    }, 700);
}

function handleMouseClick(index) {
    if (controlMode === 'mouse' && active) {
        synth.beep(440, 0.05);
        checkAnswer(index);
    }
}

function checkAnswer(index) {
    if (!active) return;
    active = false;
    
    const q = mathData[currentIdx];
    const isCorrect = (index === q.correctIndex);
    
    const fb = document.getElementById('feedback');
    const fbEmoji = document.getElementById('feedback-emoji');
    const fbTitle = document.getElementById('feedback-title');
    const fbRationale = document.getElementById('feedback-rationale');
    
    if (isCorrect) {
        score++;
        document.getElementById('score').innerText = score;
        synth.correct();
        fbEmoji.innerText = "🎉";
        fbTitle.innerText = "คำตอบถูกต้อง!";
        fbTitle.className = "text-4xl font-extrabold text-emerald-600 mb-2";
    } else {
        synth.wrong();
        fbEmoji.innerText = "😅";
        fbTitle.innerText = "คำตอบคลาดเคลื่อน!";
        fbTitle.className = "text-4xl font-extrabold text-rose-500 mb-2";
    }
    
    fbRationale.innerHTML = `<b>เฉลยวิเคราะห์:</b> ${q.rationale}`;
    fb.classList.remove('hidden');
}

function closeFeedback() {
    synth.beep(330, 0.1);
    document.getElementById('feedback').classList.add('hidden');
    currentIdx++;
    loadNext();
}

function startTimer() {
    secondsElapsed = 0;
    document.getElementById('timer').innerText = "00:00";
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        secondsElapsed++;
        document.getElementById('timer').innerText = formatTime(secondsElapsed);
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
}

function formatTime(totalSeconds) {
    let mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    let secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

function endGame() {
    active = false;
    stopTimer();
    synth.stopMusic();
    
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('summary-screen').classList.remove('hidden');
    
    document.getElementById('final-score-text').innerText = score;
    document.getElementById('final-time-text').innerText = formatTime(secondsElapsed);
    
    const emojiDiv = document.getElementById('summary-emoji');
    const evaluationText = document.getElementById('summary-evaluation-text');
    
    if (score >= 8) {
        emojiDiv.innerText = "🏆";
        evaluationText.innerHTML = "นวัตกรรมสัมฤทธิผลยอดเยี่ยมที่สุด! นักเรียนประมวลความคิดเชิงคณิตศาสตร์ได้อย่างสมบูรณ์แบบ สมควรนำเสนอเป็นตัวอย่าง Best Practice ครับ ผอ.!";
    } else if (score >= 5) {
        emojiDiv.innerText = "👍";
        evaluationText.innerHTML = "เก่งมากครับผ่านมาตรฐานเกณฑ์การประเมินวิชาคณิตศาสตร์ ป.4 สามารถกลับมาทำกิจกรรมทบทวนร่างกายและสมองได้ตลอดเวลาครับ!";
    } else {
        emojiDiv.innerText = "📚";
        evaluationText.innerHTML = "ลองฝึกฝนทำโจทย์คณิตศาสตร์และขยับสรีระร่างกายไปพร้อม ๆ กันอีกรอบนะครับ คนเก่งสามารถเก่งขึ้นได้เสมอ!";
    }
}

function exitProgram() {
    synth.beep(330, 0.2);
    stopTimer();
    synth.stopMusic();
    
    const mainContainer = document.getElementById('start-screen');
    mainContainer.innerHTML = `
        <div class="py-12 flex flex-col items-center">
            <span class="text-7xl mb-4">🏫</span>
            <h1 class="text-4xl font-extrabold text-slate-800 mb-4">ออกจากระบบการเรียนรู้</h1>
            <p class="text-slate-600 font-semibold text-xl max-w-md mb-6">ขอขอบพระคุณ ผอ. กิตติ์ธเนศ นิธิกรอุดมวิทย์ และคณะครูโรงเรียนวิวัฒน์วิทยาทุกท่านที่นำสื่อนวัตกรรมระบบ AI Active Learning มาใช้งานพัฒนาห้องเรียนครับ</p>
            <button onclick="location.reload()" class="bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xl py-3 px-8 rounded-2xl border-4 border-slate-800 shadow-[0_5px_0_#1e293b] active:translate-y-1 active:shadow-none transition">
                🔄 กลับเข้าสู่หน้าหลักอีกครั้ง
            </button>
        </div>
    `;
}

// ลูปดึงเฟรมกล้องเว็บแคมประมวลผล Mirror พิกัดและวาดเป้าหมาย 4 ทิศทาง
function onResults(res) {
    ctx.save();
    ctx.clearRect(0, 0, 800, 600);
    
    if (controlMode === 'camera') {
        // ประมวลผลกระจกเงา (Mirror) ให้ผู้เรียนยกมือตอบได้อย่างตรงพิกัดธรรมชาติไม่กลับด้าน
        ctx.translate(800, 0); 
        ctx.scale(-1, 1); 
        ctx.drawImage(res.image, 0, 0, 800, 600);

        // วาดรูปวงกลม ก ข ค ง ทั้ง 4 โซนมุมบนจอกล้องโดยตรง
        drawTargetZones();

        if (res.poseLandmarks && active) {
            const leftWrist = res.poseLandmarks[15];
            const rightWrist = res.poseLandmarks[16];
            let detectedZoneId = -1;

            [leftWrist, rightWrist].forEach(wrist => {
                if (wrist && wrist.visibility > 0.4) {
                    const posX = (1 - wrist.x) * 800; // แปลงค่าพิกัดให้สอดรับกับกระจกเงา
                    const posY = wrist.y * 600;

                    // วาดวงกลมพิกัดข้อมือบอกพิกัดแก่นักเรียน
                    ctx.beginPath();
                    ctx.arc(posX, posY, 15, 0, 2 * Math.PI);
                    ctx.fillStyle = wrist === leftWrist ? "#3b82f6" : "#f97316";
                    ctx.fill();
                    ctx.strokeStyle = "#ffffff";
                    ctx.lineWidth = 4;
                    ctx.stroke();

                    // เช็คตรวจสอบพิกัดการชนเป้าหมายคำตอบ 4 ทิศทาง
                    targetZones.forEach(zone => {
                        const distance = Math.hypot(posX - zone.x, posY - zone.y);
                        if (distance < zone.radius) {
                            detectedZoneId = zone.id;
                        }
                    });
                }
            });

            // กลไกแถบดาวน์โหลด Progress Ring ยืนยันสิทธิ์ตอบเมื่อค้างครบเวลา
            if (detectedZoneId !== -1) {
                if (hoveredZoneIndex !== detectedZoneId) {
                    hoveredZoneIndex = detectedZoneId;
                    hoverStartTime = Date.now();
                    synth.beep(880, 0.05);
                } else {
                    const timeHovered = Date.now() - hoverStartTime;
                    const progress = Math.min(timeHovered / HOVER_THRESHOLD, 1.0);
                    
                    // วาดแถบเวลา Progress Ring สีทอง
                    drawHoverProgress(hoveredZoneIndex, progress);

                    if (timeHovered >= HOVER_THRESHOLD) {
                        active = false;
                        checkAnswer(hoveredZoneIndex);
                        hoveredZoneIndex = -1;
                        hoverStartTime = null;
                    }
                }
            } else {
                hoveredZoneIndex = -1;
                hoverStartTime = null;
            }
        }
    }
    ctx.restore();
}

function drawTargetZones() {
    targetZones.forEach(zone => {
        ctx.beginPath();
        ctx.arc(zone.x, zone.y, zone.radius, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
        ctx.fill();
        ctx.strokeStyle = zone.color;
        ctx.lineWidth = 5;
        ctx.stroke();

        // ป้องกันอักษรตัวหนังสือ ก ข ค ง ไม่ให้กลับด้านตามกล้องกระจกเงา
        ctx.save();
        ctx.translate(zone.x, zone.y);
        ctx.scale(-1, 1); 
        
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, 2 * Math.PI);
        ctx.fillStyle = zone.color;
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = "bold 34px 'Kanit', sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(zone.label, 0, 2);
        ctx.restore();
    });
}

function drawHoverProgress(zoneId, progress) {
    const zone = targetZones[zoneId];
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, zone.radius + 6, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * progress));
    ctx.strokeStyle = "#fbbf24"; // วงแหวนนับถอยหลังสีทองอร่ามเมื่อชาร์จกดยืนยันสำเร็จ
    ctx.lineWidth = 8;
    ctx.stroke();
}

window.onload = function() {
    document.getElementById('start-screen').classList.remove('hidden');
}
