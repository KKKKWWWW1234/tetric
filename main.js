/**
 * 이기킹의 비행기 - 1945 슈팅 게임 (이미지 확대 & 레이저 패턴 추가 버전)
 */

// --- CONFIGURATION ---
const CONFIG = {
    player: {
        speed: 5,
        shootInterval: 250,
        health: 100,
        width: 100,  // 50 -> 100 (2배 확대)
        height: 100, // 50 -> 100
        hitboxRadius: 30, // 시각적 크기보다 작게 설정 (공정한 판정)
        invincibleDuration: 1500,
    },
    enemy: {
        width: 90,   // 45 -> 90 (2배 확대)
        height: 90,  // 45 -> 90
        hitboxRadius: 35,
        baseSpawnRate: 1200,
        minSpawnRate: 400,
        baseSpeed: 2.5,
    },
    bullet: {
        speed: 10,
        radius: 4,
        color: '#00f2ff'
    },
    item: {
        width: 35,
        height: 35,
        speed: 2,
        spawnChance: 0.12
    },
    laser: {
        unlockTime: 15000,      // 15초 후 등장
        warningDuration: 1200,  // 경고 시간 (ms)
        activeDuration: 1500,   // 발사 시간 (ms)
        cooldown: 4000,         // 다음 레이저까지 대기 시간 (ms)
        width: 70,              // 레이저 두께
        damage: 25              // 레이저 데미지
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
        asset.img.onload = () => { asset.ready = true; };
        asset.img.onerror = () => { asset.ready = false; };
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
        scores = scores.slice(0, 5);
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
        
        // 레이저 관련 상태
        this.lasers = [];
        this.laserState = 'WAITING'; // WAITING, WARNING, FIRING
        this.laserTimer = 0;
        
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
        this.lasers = [];
        this.laserState = 'WAITING';
        this.laserTimer = CONFIG.laser.cooldown;
        
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
            healthBar.style.background = hpPercent < 30 ? '#ff3e3e' : 'linear-gradient(to right, #ff3e3e, #ff7e7e)';
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

    // 레이저 로직 업데이트
    updateLasers(dt) {
        if (this.gameTime < CONFIG.laser.unlockTime) return;

        this.laserTimer -= dt;

        if (this.laserState === 'WAITING' && this.laserTimer <= 0) {
            this.laserState = 'WARNING';
            this.laserTimer = CONFIG.laser.warningDuration;
            // 무작위 2~3개 라인 생성 (화면 가로를 5등분)
            const laneWidth = this.canvas.width / 5;
            const selectedLanes = [];
            while(selectedLanes.length < 2) {
                const lane = Math.floor(Math.random() * 5);
                if (!selectedLanes.includes(lane)) selectedLanes.push(lane);
            }
            this.lasers = selectedLanes.map(lane => (lane * laneWidth) + (laneWidth / 2));
        } else if (this.laserState === 'WARNING' && this.laserTimer <= 0) {
            this.laserState = 'FIRING';
            this.laserTimer = CONFIG.laser.activeDuration;
        } else if (this.laserState === 'FIRING' && this.laserTimer <= 0) {
            this.laserState = 'WAITING';
            this.laserTimer = CONFIG.laser.cooldown - (this.difficultyFactor * 500); // 후반부로 갈수록 쿨타임 감소
            this.lasers = [];
        }
    }

    handleCollisions() {
        // Bullet vs Enemy
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            for (let j = this.enemies.length - 1; j >= 0; j--) {
                const e = this.enemies[j];
                const dist = Math.hypot(b.x - e.x, b.y - e.y);
                if (dist < CONFIG.enemy.hitboxRadius + 5) {
                    this.createExplosion(e.x, e.y, '#ffd700');
                    this.enemies.splice(j, 1);
                    this.bullets.splice(i, 1);
                    this.score += 100 * this.wave;
                    if (Math.random() < CONFIG.item.spawnChance) this.items.push(new Item(e.x, e.y));
                    this.updateUI();
                    break;
                }
            }
        }

        if (!this.player || this.player.isInvincible) return;

        // Enemy vs Player
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            const dist = Math.hypot(this.player.x - e.x, this.player.y - e.y);
            if (dist < CONFIG.player.hitboxRadius + CONFIG.enemy.hitboxRadius - 10) {
                this.player.hit(20);
                this.createExplosion(this.player.x, this.player.y, '#ff3e3e', 25);
                this.enemies.splice(i, 1);
                this.updateUI();
                if (this.player.health <= 0) this.gameOver();
            }
        }

        // Laser vs Player
        if (this.laserState === 'FIRING') {
            for (const lx of this.lasers) {
                const halfWidth = CONFIG.laser.width / 2;
                if (Math.abs(this.player.x - lx) < halfWidth + (CONFIG.player.hitboxRadius * 0.7)) {
                    this.player.hit(CONFIG.laser.damage);
                    this.createExplosion(this.player.x, this.player.y, '#ffffff', 10);
                    this.updateUI();
                    if (this.player.health <= 0) this.gameOver();
                    break;
                }
            }
        }

        // Item vs Player
        for (let i = this.items.length - 1; i >= 0; i--) {
            const item = this.items[i];
            const dist = Math.hypot(this.player.x - item.x, this.player.y - item.y);
            if (dist < 45) {
                this.player.powerUp();
                this.items.splice(i, 1);
                this.score += 500;
                this.updateUI();
                const el = document.getElementById('powerup-notify');
                el.classList.remove('hidden');
                setTimeout(() => el.classList.add('hidden'), 2000);
            }
        }
    }

    createExplosion(x, y, color, count = 15) {
        for (let i = 0; i < count; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    update(timestamp) {
        if (!this.isStarted || this.isGameOver) return;

        const dt = 16.67; 
        this.gameTime += dt;
        this.difficultyFactor = 1 + (this.gameTime / 25000);
        const newWave = Math.floor(this.gameTime / 20000) + 1;
        if (newWave !== this.wave) {
            this.wave = newWave;
            this.updateUI();
        }

        this.player.update(this.keys, this.canvas);
        this.updateLasers(dt);
        
        const shootInt = CONFIG.player.shootInterval / (1 + (this.player.powerLevel * 0.2));
        if ((this.keys['Space'] || this.keys['KeyZ']) && timestamp - this.lastShotTime > shootInt) {
            if (this.player.powerLevel >= 2) {
                this.bullets.push(new Bullet(this.player.x - 25, this.player.y - 20));
                this.bullets.push(new Bullet(this.player.x + 25, this.player.y - 20));
            } else {
                this.bullets.push(new Bullet(this.player.x, this.player.y - 35));
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
            if (e.y > this.canvas.height + 100) this.enemies.splice(i, 1);
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
        
        // 배경 드로잉
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

        // 레이저 드로잉
        this.lasers.forEach(lx => {
            if (this.laserState === 'WARNING') {
                this.ctx.fillStyle = 'rgba(255, 60, 60, 0.25)';
                this.ctx.fillRect(lx - CONFIG.laser.width/2, 0, CONFIG.laser.width, this.canvas.height);
                this.ctx.strokeStyle = 'rgba(255, 100, 100, 0.5)';
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(lx - CONFIG.laser.width/2, 0, CONFIG.laser.width, this.canvas.height);
            } else if (this.laserState === 'FIRING') {
                const grad = this.ctx.createLinearGradient(lx - CONFIG.laser.width/2, 0, lx + CONFIG.laser.width/2, 0);
                grad.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
                grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.9)');
                grad.addColorStop(1, 'rgba(255, 0, 0, 0.8)');
                this.ctx.fillStyle = grad;
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = 'red';
                this.ctx.fillRect(lx - CONFIG.laser.width/2, 0, CONFIG.laser.width, this.canvas.height);
                this.ctx.shadowBlur = 0;
            }
        });

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

        this.x = Math.max(CONFIG.player.width/2, Math.min(canvas.width - CONFIG.player.width/2, this.x + dx));
        this.y = Math.max(CONFIG.player.height/2, Math.min(canvas.height - CONFIG.player.height/2, this.y + dy));
        
        if (dx < 0) this.tilt = Math.max(-0.2, this.tilt - 0.04);
        else if (dx > 0) this.tilt = Math.min(0.2, this.tilt + 0.04);
        else this.tilt *= 0.9;

        if (this.isInvincible) {
            this.invincibleTimer -= 16.67;
            if (this.invincibleTimer <= 0) this.isInvincible = false;
        }
    }

    hit(dmg) {
        if (this.isInvincible) return;
        this.health -= dmg;
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
        if (this.isInvincible && Math.floor(Date.now() / 100) % 2 === 0) ctx.globalAlpha = 0.3;

        if (ASSETS.player.ready) {
            ctx.drawImage(ASSETS.player.img, -CONFIG.player.width/2, -CONFIG.player.height/2, CONFIG.player.width, CONFIG.player.height);
        } else {
            ctx.fillStyle = '#ff3e3e';
            ctx.beginPath(); ctx.moveTo(0, -CONFIG.player.height/2); ctx.lineTo(CONFIG.player.width/2, CONFIG.player.height/2); ctx.lineTo(-CONFIG.player.width/2, CONFIG.player.height/2); ctx.closePath(); ctx.fill();
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
            this.x = this.initialX + Math.sin(this.time) * 80;
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
            ctx.beginPath(); ctx.arc(0, 0, CONFIG.enemy.width/2, 0, Math.PI*2); ctx.fill();
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
        ctx.moveTo(this.x, this.y - CONFIG.item.height/2);
        ctx.lineTo(this.x + CONFIG.item.width/2, this.y + CONFIG.item.height/2);
        ctx.lineTo(this.x - CONFIG.item.width/2, this.y + CONFIG.item.height/2);
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

new Game();
