/**
 * 이기킹의 비행기 - 1945 슈팅 게임
 * Modern Vanilla JS + Canvas API
 */

// --- CONFIGURATION ---
const CONFIG = {
    player: {
        speed: 5,
        shootInterval: 250,
        health: 100,
        width: 50,
        height: 50,
        invincibleDuration: 1500, // 피격 후 무적 시간 (ms)
    },
    enemy: {
        width: 45,
        height: 45,
        baseSpawnRate: 1200, // 초기 적 스폰 간격 (ms)
        minSpawnRate: 400,    // 최소 적 스폰 간격 (난이도 상한)
        baseSpeed: 2.5,
    },
    bullet: {
        speed: 9,
        radius: 4,
        color: '#00f2ff'
    },
    item: {
        width: 30,
        height: 30,
        speed: 2,
        spawnChance: 0.1 // 적 처치 시 아이템 드롭 확률
    }
};

// --- ASSET LOADER ---
const ASSETS = {
    player: { img: new Image(), ready: false, src: 'enemy/1.png' },
    enemy: { img: new Image(), ready: false, src: 'enemy/2.png' },
    background: { img: new Image(), ready: false, src: 'photo/2.jpg' }
};

function loadAssets() {
    Object.keys(ASSETS).forEach(key => {
        const asset = ASSETS[key];
        asset.img.src = asset.src;
        
        asset.img.onload = () => {
            asset.ready = true;
            console.log(`Asset Loaded: ${key}`);
        };
        
        asset.img.onerror = () => {
            asset.ready = false;
            console.error(`Asset Failed: ${key} (${asset.src})`);
        };
    });
}

// --- STORAGE MANAGER ---
const StorageManager = {
    SAVE_KEY: 'igiking_high_scores',
    
    getScores() {
        const data = localStorage.getItem(this.SAVE_KEY);
        return data ? JSON.parse(data) : [];
    },

    saveScore(score) {
        let scores = this.getScores();
        scores.push({ score, date: new Date().toLocaleDateString() });
        scores.sort((a, b) => b.score - a.score);
        scores = scores.slice(0, 5); // 상위 5개만 유지
        localStorage.setItem(this.SAVE_KEY, JSON.stringify(scores));
    }
};

// --- GAME ENGINE ---
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.score = 0;
        this.isGameOver = false;
        this.isStarted = false;
        this.gameTime = 0;
        this.difficultyFactor = 1;
        this.wave = 1;
        
        this.player = null;
        this.bullets = [];
        this.enemies = [];
        this.items = [];
        this.particles = [];
        
        this.lastEnemySpawn = 0;
        this.lastShotTime = 0;
        this.bgY = 0;
        this.keys = {};
        
        this.init();
    }

    init() {
        loadAssets();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        // UI 이벤트 바인딩
        document.getElementById('start-button').onclick = () => this.start();
        document.getElementById('restart-button').onclick = () => this.start();
        document.getElementById('exit-button').onclick = () => location.reload();
        document.getElementById('scoreboard-button').onclick = () => this.toggleScoreboard(true);
        document.getElementById('close-scoreboard').onclick = () => this.toggleScoreboard(false);

        this.animate();
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
        this.items = [];
        this.particles = [];
        this.score = 0;
        this.gameTime = 0;
        this.difficultyFactor = 1;
        this.wave = 1;
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
        StorageManager.saveScore(this.score);
    }

    toggleScoreboard(show) {
        const modal = document.getElementById('scoreboard-modal');
        if (show) {
            const scores = StorageManager.getScores();
            const list = document.getElementById('scores-list');
            list.innerHTML = scores.length > 0 
                ? scores.map((s, i) => `
                    <div class="score-entry">
                        <span><span class="score-rank">${i+1}위</span> ${s.date}</span>
                        <span>${s.score.toLocaleString()}</span>
                    </div>`).join('')
                : '<div class="score-entry">기록이 없습니다.</div>';
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    }

    updateUI() {
        document.getElementById('score-value').innerText = this.score.toLocaleString();
        document.getElementById('wave-label').innerText = `WAVE ${this.wave}`;
        const healthBar = document.getElementById('health-bar');
        if (this.player) {
            const hpPercent = Math.max(0, (this.player.health / CONFIG.player.health) * 100);
            healthBar.style.width = `${hpPercent}%`;
        }
    }

    spawnEnemy(timestamp) {
        const spawnInterval = Math.max(CONFIG.enemy.minSpawnRate, CONFIG.enemy.baseSpawnRate / this.difficultyFactor);
        if (timestamp - this.lastEnemySpawn > spawnInterval) {
            const x = Math.random() * (this.canvas.width - CONFIG.enemy.width) + CONFIG.enemy.width / 2;
            const type = this.wave > 1 && Math.random() > 0.7 ? 'sine' : 'straight';
            this.enemies.push(new Enemy(x, -50, this.difficultyFactor, type));
            this.lastEnemySpawn = timestamp;
        }
    }

    createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    notifyPowerUp() {
        const el = document.getElementById('powerup-notify');
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 2000);
    }

    handleCollisions() {
        // Bullet vs Enemy
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const dist = Math.hypot(b.x - e.x, b.y - e.y);
                if (dist < 30) {
                    this.createExplosion(e.x, e.y, '#ffd700');
                    this.enemies.splice(j, 1);
                    this.bullets.splice(i, 1);
                    this.score += 100 * this.wave;
                    
                    if (Math.random() < CONFIG.item.spawnChance) {
                        this.items.push(new Item(e.x, e.y));
                    }
                    
                    this.updateUI();
                    break;
                }
            }
        }

        // Enemy vs Player
        if (this.player && !this.player.isInvincible) {
            for (let i = this.enemies.length - 1; i >= 0; i--) {
                const e = this.enemies[i];
                const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
                if (dist < 35) {
                    this.player.hit();
                    this.createExplosion(this.player.x, this.player.y, '#ff3e3e', 25);
                    this.enemies.splice(i, 1);
                    this.updateUI();
                    if (this.player.health <= 0) this.gameOver();
                }
            }
        }

        // Item vs Player
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
            if (dist < 40) {
                this.player.powerUp();
                this.items.splice(i, 1);
                this.notifyPowerUp();
                this.score += 500;
                this.updateUI();
            }
        }
    }

    update(timestamp) {
        if (!this.isStarted || this.isGameOver) return;

        this.gameTime += 16.67;
        this.difficultyFactor = 1 + (this.gameTime / 20000);
        const newWave = Math.floor(this.gameTime / 20000) + 1;
        if (newWave !== this.wave) {
            this.wave = newWave;
            this.updateUI();
        }

        this.player.update(this.keys, this.canvas);
        
        const shootInt = CONFIG.player.shootInterval / (1 + (this.player.powerLevel * 0.2));
        if ((this.keys['Space'] || this.keys['KeyZ']) && timestamp - this.lastShotTime > shootInt) {
            if (this.player.powerLevel >= 2) {
                this.bullets.push(new Bullet(this.player.x - 15, this.player.y - 20));
                this.bullets.push(new Bullet(this.player.x + 15, this.player.y - 20));
            } else {
                this.bullets.push(new Bullet(this.player.x, this.player.y - 30));
            }
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

        this.items.forEach((item, i) => {
            item.update();
            if (item.y > this.canvas.height + 50) this.items.splice(i, 1);
        });

        this.particles.forEach((p, i) => {
            p.update();
            if (p.alpha <= 0) this.particles.splice(i, 1);
        });

        this.handleCollisions();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 배경 드로잉 (무한 스크롤)
        if (ASSETS.background.ready) {
            const img = ASSETS.background.img;
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

        if (!this.isStarted) return;

        this.particles.forEach(p => p.draw(this.ctx));
        this.items.forEach(item => item.draw(this.ctx));
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
        this.powerLevel = 1;
        this.isInvincible = false;
        this.invincibleTimer = 0;
        this.tilt = 0;
    }

    update(keys, canvas) {
        let dx = 0, dy = 0;
        if (keys['ArrowLeft'] || keys['KeyA']) dx -= CONFIG.player.speed;
        if (keys['ArrowRight'] || keys['KeyD']) dx += CONFIG.player.speed;
        if (keys['ArrowUp'] || keys['KeyW']) dy -= CONFIG.player.speed;
        if (keys['ArrowDown'] || keys['KeyS']) dy += CONFIG.player.speed;

        this.x = Math.max(30, Math.min(canvas.width - 30, this.x + dx));
        this.y = Math.max(30, Math.min(canvas.height - 30, this.y + dy));
        
        if (dx < 0) this.tilt = Math.max(-0.2, this.tilt - 0.04);
        else if (dx > 0) this.tilt = Math.min(0.2, this.tilt + 0.04);
        else this.tilt *= 0.9;

        if (this.isInvincible) {
            this.invincibleTimer -= 16.67;
            if (this.invincibleTimer <= 0) this.isInvincible = false;
        }
    }

    hit() {
        this.health -= 20;
        this.isInvincible = true;
        this.invincibleTimer = CONFIG.player.invincibleDuration;
    }

    powerUp() {
        if (this.powerLevel < 3) this.powerLevel++;
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);
        
        if (this.isInvincible && Math.floor(Date.now() / 100) % 2 === 0) {
            ctx.globalAlpha = 0.3;
        }

        if (ASSETS.player.ready) {
            ctx.drawImage(ASSETS.player.img, -CONFIG.player.width/2, -CONFIG.player.height/2, CONFIG.player.width, CONFIG.player.height);
        } else {
            ctx.fillStyle = '#ff3e3e';
            ctx.beginPath(); ctx.moveTo(0, -25); ctx.lineTo(25, 15); ctx.lineTo(-25, 15); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
    }
}

class Enemy {
    constructor(x, y, diff, type) {
        this.x = x; this.y = y;
        this.type = type;
        this.speed = (CONFIG.enemy.baseSpeed + Math.random()) * diff;
        this.initialX = x;
        this.time = 0;
    }

    update() {
        this.y += this.speed;
        if (this.type === 'sine') {
            this.time += 0.05;
            this.x = this.initialX + Math.sin(this.time) * 60;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        if (ASSETS.enemy.ready) {
            ctx.rotate(Math.PI); 
            ctx.drawImage(ASSETS.enemy.img, -CONFIG.enemy.width/2, -CONFIG.enemy.height/2, CONFIG.enemy.width, CONFIG.enemy.height);
        } else {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
    }
}

class Bullet {
    constructor(x, y) { this.x = x; this.y = y; }
    update() { this.y -= CONFIG.bullet.speed; }
    draw(ctx) {
        ctx.fillStyle = CONFIG.bullet.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, CONFIG.bullet.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 10; ctx.shadowColor = CONFIG.bullet.color;
    }
}

class Item {
    constructor(x, y) { this.x = x; this.y = y; }
    update() { this.y += CONFIG.item.speed; }
    draw(ctx) {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.moveTo(this.x, this.y - 15);
        ctx.lineTo(this.x + 15, this.y + 15);
        ctx.lineTo(this.x - 15, this.y + 15);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 15; ctx.shadowColor = '#ffd700';
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.radius = Math.random() * 3 + 1;
        this.velocity = { x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6 };
        this.alpha = 1;
        this.decay = Math.random() * 0.03 + 0.02;
    }
    update() { this.x += this.velocity.x; this.y += this.velocity.y; this.alpha -= this.decay; }
    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

// 엔진 가동
new Game();
