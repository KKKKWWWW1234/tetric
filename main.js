/**
 * 이기킹의 비행기 - 1945 Air Force Modern Remake
 * Built with Vanilla JS, Canvas API & Firebase
 */

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

let db, auth;
try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    }
} catch (e) {
    console.warn("Firebase initialization failed.");
}

// --- Configuration & Constants ---
const CONFIG = {
    player: {
        speed: 6,
        shootInterval: 200,
        health: 100,
        width: 60,
        height: 60
    },
    enemy: {
        spawnRate: 1200,
        baseSpeed: 2.5,
        width: 50,
        height: 50
    },
    bullet: {
        speed: 10,
        radius: 4
    }
};

// --- Asset Loader ---
const ASSETS = {
    playerImg: new Image(),
    enemyImg: new Image(),
    bgImg: new Image(),
    isLoaded: false
};

function loadAssets() {
    ASSETS.playerImg.src = 'enemy/1.png';
    ASSETS.enemyImg.src = 'enemy/2.png';
    ASSETS.bgImg.src = 'photo/2.png';

    let loadedCount = 0;
    const totalAssets = 3;
    const onAssetLoad = () => {
        loadedCount++;
        if (loadedCount === totalAssets) ASSETS.isLoaded = true;
    };

    ASSETS.playerImg.onload = onAssetLoad;
    ASSETS.enemyImg.onload = onAssetLoad;
    ASSETS.bgImg.onload = onAssetLoad;
}

// --- Game Engine Classes ---

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.score = 0;
        this.isGameOver = false;
        this.isStarted = false;
        this.user = null;
        this.gameTime = 0;
        this.difficultyFactor = 1;
        
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.bgY = 0;
        
        this.lastEnemySpawn = 0;
        this.lastShotTime = 0;
        this.keys = {};
        
        loadAssets();
        this.init();
    }

    init() {
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchend', () => this.keys['Space'] = false, { passive: false });
        
        document.getElementById('start-button').addEventListener('click', () => this.start());
        document.getElementById('restart-button').addEventListener('click', () => this.start());
        document.getElementById('login-button').addEventListener('click', () => this.login());
        document.getElementById('scoreboard-button').addEventListener('click', () => this.toggleScoreboard(true));
        document.getElementById('close-scoreboard').addEventListener('click', () => this.toggleScoreboard(false));
        
        this.initAuth();
        this.animate();
    }

    initAuth() {
        if (auth) {
            auth.onAuthStateChanged((user) => {
                if (user) {
                    this.user = user;
                    this.showLoggedInUI(user);
                } else {
                    this.user = null;
                    this.showLoggedOutUI();
                }
            });
        } else {
            document.getElementById('login-button').addEventListener('click', () => {
                this.user = { displayName: "이기킹 (Guest)", photoURL: "https://via.placeholder.com/30" };
                this.showLoggedInUI(this.user);
            });
        }
    }

    login() {
        if (!auth) return;
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(error => console.error(error));
    }

    showLoggedInUI(user) {
        document.getElementById('login-button').classList.add('hidden');
        document.getElementById('start-button').classList.remove('hidden');
        document.getElementById('user-info').classList.remove('hidden');
        document.getElementById('user-name').innerText = user.displayName;
        document.getElementById('user-avatar').src = user.photoURL || "https://via.placeholder.com/30";
    }

    showLoggedOutUI() {
        document.getElementById('login-button').classList.remove('hidden');
        document.getElementById('start-button').classList.add('hidden');
        document.getElementById('user-info').classList.add('hidden');
    }

    async toggleScoreboard(show) {
        const modal = document.getElementById('scoreboard-modal');
        if (show) {
            modal.classList.remove('hidden');
            await this.loadRankings();
        } else {
            modal.classList.add('hidden');
        }
    }

    async loadRankings() {
        const scoresList = document.getElementById('scores-list');
        scoresList.innerHTML = "Loading...";

        let rankings = [];
        if (db) {
            try {
                const snapshot = await db.collection('highscores').orderBy('score', 'desc').limit(10).get();
                rankings = snapshot.docs.map(doc => doc.data());
            } catch (e) { console.error("Firestore failed", e); }
        }

        // Fallback to local storage if Firebase fails or is empty
        if (rankings.length === 0) {
            const local = localStorage.getItem('localRankings');
            rankings = local ? JSON.parse(local) : [
                { name: "이기킹", score: 15000 },
                { name: "에이스", score: 12000 },
                { name: "파일럿", score: 8000 }
            ];
        }

        scoresList.innerHTML = rankings.map((r, i) => `
            <div class="score-entry">
                <span>${i + 1}. ${r.name}</span>
                <span>${r.score.toLocaleString()}</span>
            </div>
        `).join('');
    }

    async saveScore(score) {
        const name = this.user ? this.user.displayName : "익명";
        if (db) {
            try {
                await db.collection('highscores').add({ name, score, date: new Date() });
            } catch (e) { console.error("Save score failed", e); }
        }
        
        // Save to local storage
        let local = JSON.parse(localStorage.getItem('localRankings') || "[]");
        local.push({ name, score });
        local.sort((a, b) => b.score - a.score);
        localStorage.setItem('localRankings', JSON.stringify(local.slice(0, 10)));
    }

    handleTouch(e) {
        if (!this.isStarted || this.isGameOver) return;
        e.preventDefault();
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.player.x = touch.clientX - rect.left;
        this.player.y = touch.clientY - rect.top - 80;
        this.keys['Space'] = true;
    }

    drawBackground() {
        if (ASSETS.isLoaded) {
            // Parallax image background
            const img = ASSETS.bgImg;
            const scale = this.canvas.width / img.width;
            const h = img.height * scale;
            
            this.ctx.drawImage(img, 0, this.bgY, this.canvas.width, h);
            this.ctx.drawImage(img, 0, this.bgY - h, this.canvas.width, h);
            
            this.bgY += 1.5 * this.difficultyFactor;
            if (this.bgY >= h) this.bgY = 0;
        } else {
            this.ctx.fillStyle = '#0a0a0c';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    }

    resize() {
        const container = document.getElementById('game-container');
        this.canvas.width = container.clientWidth;
        this.canvas.height = container.clientHeight;
    }

    start() {
        this.player = new Player(this.canvas.width / 2, this.canvas.height - 100);
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.score = 0;
        this.gameTime = 0;
        this.difficultyFactor = 1;
        this.isGameOver = false;
        this.isStarted = true;
        
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        this.updateUI();
    }

    gameOver() {
        this.isGameOver = true;
        document.getElementById('final-score').innerText = this.score.toLocaleString();
        document.getElementById('game-over-screen').classList.remove('hidden');
        this.saveScore(this.score);
    }

    updateUI() {
        document.getElementById('score-value').innerText = this.score.toLocaleString();
        const healthBar = document.getElementById('health-bar');
        if (this.player) {
            const healthPercent = Math.max(0, (this.player.health / CONFIG.player.health) * 100);
            healthBar.style.width = `${healthPercent}%`;
        }
    }

    spawnEnemy(timestamp) {
        const currentSpawnRate = CONFIG.enemy.spawnRate / this.difficultyFactor;
        if (timestamp - this.lastEnemySpawn > currentSpawnRate) {
            const x = Math.random() * (this.canvas.width - CONFIG.enemy.width) + CONFIG.enemy.width / 2;
            this.enemies.push(new Enemy(x, -50, this.difficultyFactor));
            this.lastEnemySpawn = timestamp;
        }
    }

    handleCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const b = this.bullets[i];
                const e = this.enemies[j];
                const dist = Math.hypot(b.x - e.x, b.y - e.y);
                if (dist < 30) {
                    this.createExplosion(e.x, e.y, '#ffd700');
                    this.bullets.splice(i, 1);
                    this.enemies.splice(j, 1);
                    this.score += 100;
                    this.updateUI();
                    break;
                }
            }
        }

        if (this.player && !this.isGameOver) {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
                if (dist < 40) {
                    this.player.health -= 25;
                    this.createExplosion(e.x, e.y, '#ff3e3e');
                    this.enemies.splice(i, 1);
                    this.updateUI();
                    if (this.player.health <= 0) this.gameOver();
                }
            }
        }
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 20; i++) this.particles.push(new Particle(x, y, color));
    }

    update(timestamp) {
        if (!this.isStarted || this.isGameOver) return;

        // Difficulty scaling over time
        this.gameTime += 16.67; // approx ms per frame
        this.difficultyFactor = 1 + (this.gameTime / 30000); // Increases by 1 every 30 seconds

        this.player.update(this.keys, this.canvas);
        
        if ((this.keys['Space'] || this.keys['KeyZ']) && timestamp - this.lastShotTime > CONFIG.player.shootInterval) {
            this.bullets.push(new Bullet(this.player.x, this.player.y - 30));
            this.lastShotTime = timestamp;
        }

        this.bullets.forEach((b, i) => {
            b.update();
            if (b.y < -50) this.bullets.splice(i, 1);
        });

        this.spawnEnemy(timestamp);
        this.enemies.forEach((e, i) => {
            e.update();
            if (e.y > this.canvas.height + 100) this.enemies.splice(i, 1);
        });

        this.particles.forEach((p, i) => {
            p.update();
            if (p.alpha <= 0) this.particles.splice(i, 1);
        });

        this.handleCollisions();
    }

    draw() {
        this.drawBackground();
        if (!this.isStarted) return;
        this.particles.forEach(p => p.draw(this.ctx));
        this.bullets.forEach(b => b.draw(this.ctx));
        this.enemies.forEach(e => e.draw(this.ctx));
        if (this.player && !this.isGameOver) this.player.draw(this.ctx);
    }

    animate(timestamp = 0) {
        this.update(timestamp);
        this.draw();
        requestAnimationFrame((t) => this.animate(t));
    }
}

class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.health = CONFIG.player.health;
        this.tilt = 0;
    }

    update(keys, canvas) {
        let dx = 0; let dy = 0;
        if (keys['ArrowLeft'] || keys['KeyA']) dx -= CONFIG.player.speed;
        if (keys['ArrowRight'] || keys['KeyD']) dx += CONFIG.player.speed;
        if (keys['ArrowUp'] || keys['KeyW']) dy -= CONFIG.player.speed;
        if (keys['ArrowDown'] || keys['KeyS']) dy += CONFIG.player.speed;

        this.x = Math.max(30, Math.min(canvas.width - 30, this.x + dx));
        this.y = Math.max(30, Math.min(canvas.height - 30, this.y + dy));
        
        if (dx < 0) this.tilt = Math.max(-0.2, this.tilt - 0.05);
        else if (dx > 0) this.tilt = Math.min(0.2, this.tilt + 0.05);
        else this.tilt *= 0.9;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);
        if (ASSETS.isLoaded) {
            ctx.drawImage(ASSETS.playerImg, -30, -30, 60, 60);
        } else {
            ctx.fillStyle = '#ff3e3e';
            ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(20, 10); ctx.lineTo(-20, 10); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y, diff) {
        this.x = x; this.y = y;
        this.speed = (CONFIG.enemy.baseSpeed + Math.random()) * diff;
    }

    update() {
        this.y += this.speed;
        this.x += Math.sin(this.y / 40) * 1.2;
    }

    draw(ctx) {
        ctx.save();
        if (ASSETS.isLoaded) {
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.PI); // Enemy faces down
            ctx.drawImage(ASSETS.enemyImg, -25, -25, 50, 50);
        } else {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(this.x, this.y, 15, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) { this.x = x; this.y = y; }
    update() { this.y -= CONFIG.bullet.speed; }
    draw(ctx) {
        ctx.fillStyle = '#00f2ff';
        ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = '#00f2ff';
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.radius = Math.random() * 3 + 1;
        this.velocity = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 };
        this.alpha = 1; this.decay = Math.random() * 0.03 + 0.02;
    }
    update() { this.x += this.velocity.x; this.y += this.velocity.y; this.alpha -= this.decay; }
    draw(ctx) {
        ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
}

new Game();
