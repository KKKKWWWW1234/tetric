/**
 * 이기킹의 비행기 - 1945 Air Force Modern Remake
 * Built with Vanilla JS, Canvas API & Firebase
 */

// --- Firebase Configuration (PLACEHOLDER) ---
// User should replace this with their actual Firebase config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase if config is provided
let db, auth;
try {
    if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    }
} catch (e) {
    console.warn("Firebase initialization failed. Check your config.");
}

// --- Configuration & Constants ---
const CONFIG = {
    player: {
        speed: 5,
        shootInterval: 250,
        health: 100,
        radius: 20
    },
    enemy: {
        spawnRate: 1000,
        baseSpeed: 2,
        radius: 15
    },
    bullet: {
        speed: 8,
        radius: 4
    }
};

// --- Game Engine Classes ---

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.score = 0;
        this.isGameOver = false;
        this.isStarted = false;
        this.user = null;
        
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.particles = [];
        this.backgroundStars = [];
        
        this.lastEnemySpawn = 0;
        this.lastShotTime = 0;
        this.keys = {};
        
        this.init();
    }

    init() {
        this.resize();
        this.initBackground();
        window.addEventListener('resize', () => {
            this.resize();
            this.initBackground();
        });
        
        // Input handling
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // Touch handling
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchmove', (e) => this.handleTouch(e), { passive: false });
        this.canvas.addEventListener('touchend', () => {
            this.keys['Space'] = false;
        }, { passive: false });
        
        // UI event listeners
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
            // Mock auth for development if no Firebase config
            console.log("Using Mock Auth for development.");
            document.getElementById('login-button').addEventListener('click', () => {
                const mockUser = { displayName: "이기킹 (Mock)", photoURL: "https://via.placeholder.com/30" };
                this.user = mockUser;
                this.showLoggedInUI(mockUser);
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
        document.getElementById('user-avatar').src = user.photoURL;
    }

    showLoggedOutUI() {
        document.getElementById('login-button').classList.remove('hidden');
        document.getElementById('start-button').classList.add('hidden');
        document.getElementById('user-info').classList.add('hidden');
    }

    toggleScoreboard(show) {
        const modal = document.getElementById('scoreboard-modal');
        if (show) modal.classList.remove('hidden');
        else modal.classList.add('hidden');
    }

    handleTouch(e) {
        if (!this.isStarted || this.isGameOver) return;
        e.preventDefault();
        
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const touchX = touch.clientX - rect.left;
        const touchY = touch.clientY - rect.top;
        
        this.player.x += (touchX - this.player.x) * 0.2;
        this.player.y += (touchY - 100 - this.player.y) * 0.2;
        this.keys['Space'] = true;
    }

    initBackground() {
        this.backgroundStars = [];
        for (let i = 0; i < 100; i++) {
            this.backgroundStars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 2 + 0.5
            });
        }
    }

    drawBackground() {
        this.ctx.fillStyle = '#0a0a0c';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        this.backgroundStars.forEach(star => {
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            star.y += star.speed;
            if (star.y > this.canvas.height) {
                star.y = -10;
                star.x = Math.random() * this.canvas.width;
            }
        });
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
        this.isGameOver = false;
        this.isStarted = true;
        
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        this.updateUI();
    }

    gameOver() {
        this.isGameOver = true;
        document.getElementById('final-score').innerText = this.score;
        document.getElementById('game-over-screen').classList.remove('hidden');
        // Save score if logged in (Firestore logic would go here)
    }

    updateUI() {
        document.getElementById('score-value').innerText = this.score;
        const healthBar = document.getElementById('health-bar');
        if (this.player) {
            const healthPercent = Math.max(0, (this.player.health / CONFIG.player.health) * 100);
            healthBar.style.width = `${healthPercent}%`;
        }
    }

    spawnEnemy(timestamp) {
        if (timestamp - this.lastEnemySpawn > CONFIG.enemy.spawnRate) {
            const x = Math.random() * (this.canvas.width - CONFIG.enemy.radius * 2) + CONFIG.enemy.radius;
            this.enemies.push(new Enemy(x, -50));
            this.lastEnemySpawn = timestamp;
            
            CONFIG.enemy.spawnRate = Math.max(300, 1000 - (this.score * 0.5));
        }
    }

    handleCollisions() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const b = this.bullets[i];
                const e = this.enemies[j];
                
                const dist = Math.hypot(b.x - e.x, b.y - e.y);
                if (dist < b.radius + e.radius) {
                    this.createExplosion(e.x, e.y, '#ffd700');
                    this.bullets.splice(i, 1);
                    this.enemies.splice(j, 1);
                    this.score += 100; // Reward points for kill
                    this.updateUI();
                    break;
                }
            }
        }

        if (this.player && !this.isGameOver) {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
                
                if (dist < this.player.radius + e.radius) {
                    this.player.health -= 20;
                    this.createExplosion(e.x, e.y, '#ff3e3e');
                    this.enemies.splice(i, 1);
                    this.updateUI();
                    
                    if (this.player.health <= 0) {
                        this.gameOver();
                    }
                }
            }
        }
    }

    createExplosion(x, y, color) {
        for (let i = 0; i < 15; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    update(timestamp) {
        if (!this.isStarted || this.isGameOver) return;

        this.player.update(this.keys, this.canvas);
        
        if ((this.keys['Space'] || this.keys['KeyZ']) && timestamp - this.lastShotTime > CONFIG.player.shootInterval) {
            this.bullets.push(new Bullet(this.player.x, this.player.y - 20));
            this.lastShotTime = timestamp;
        }

        this.bullets.forEach((b, i) => {
            b.update();
            if (b.y < -50) this.bullets.splice(i, 1);
        });

        this.spawnEnemy(timestamp);
        this.enemies.forEach((e, i) => {
            e.update();
            if (e.y > this.canvas.height + 50) this.enemies.splice(i, 1);
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
        
        if (this.player && !this.isGameOver) {
            this.player.draw(this.ctx);
        }
    }

    animate(timestamp = 0) {
        this.update(timestamp);
        this.draw();
        requestAnimationFrame((t) => this.animate(t));
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.player.radius;
        this.health = CONFIG.player.health;
        this.color = '#ff3e3e';
        this.tilt = 0;
    }

    update(keys, canvas) {
        let dx = 0;
        let dy = 0;
        
        if (keys['ArrowLeft'] || keys['KeyA']) dx -= CONFIG.player.speed;
        if (keys['ArrowRight'] || keys['KeyD']) dx += CONFIG.player.speed;
        if (keys['ArrowUp'] || keys['KeyW']) dy -= CONFIG.player.speed;
        if (keys['ArrowDown'] || keys['KeyS']) dy += CONFIG.player.speed;

        this.x = Math.max(this.radius, Math.min(canvas.width - this.radius, this.x + dx));
        this.y = Math.max(this.radius, Math.min(canvas.height - this.radius, this.y + dy));
        
        if (dx < 0) this.tilt = Math.max(-0.3, this.tilt - 0.05);
        else if (dx > 0) this.tilt = Math.min(0.3, this.tilt + 0.05);
        else this.tilt *= 0.9;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(0, -25);
        ctx.lineTo(15, 10);
        ctx.lineTo(0, 5);
        ctx.lineTo(-15, 10);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(30, 0);
        ctx.lineWidth = 4;
        ctx.strokeStyle = this.color;
        ctx.stroke();
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.enemy.radius;
        this.speed = CONFIG.enemy.baseSpeed + Math.random();
        this.color = '#ffd700';
    }

    update() {
        this.y += this.speed;
        this.x += Math.sin(this.y / 30) * 1.5;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y + 20);
        ctx.lineTo(this.x - 15, this.y - 10);
        ctx.lineTo(this.x, this.y - 5);
        ctx.lineTo(this.x + 15, this.y - 10);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.bullet.radius;
        this.color = '#00f2ff';
    }

    update() {
        this.y -= CONFIG.bullet.speed;
    }

    draw(ctx) {
        ctx.save();
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = Math.random() * 3 + 1;
        this.velocity = {
            x: (Math.random() - 0.5) * 5,
            y: (Math.random() - 0.5) * 5
        };
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.01;
    }

    update() {
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.alpha -= this.decay;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Start the engine
new Game();
