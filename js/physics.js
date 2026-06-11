import { PHYSICS_CONFIG } from './config.js';

/**
 * 质点类 (Verlet Integration Point)
 */
class PhysicsPoint {
    constructor(x, y, radius = 0, mass = 1.0) {
        this.x = x;
        this.y = y;
        this.px = x; // 上一帧的位置，用于隐式计算速度
        this.py = y;
        this.radius = radius;
        this.mass = mass;
        this.grounded = false;
        this.normalX = 0;
        this.normalY = 0;
    }

    update(gravity, damp) {
        const vx = (this.x - this.px) * damp;
        const vy = (this.y - this.py) * damp;

        this.px = this.x;
        this.py = this.y;

        this.x += vx;
        this.y += vy - gravity; // 注意：我们以 +y 为上方，所以重力是向下 (-y)
    }

    getVelocity() {
        return {
            x: this.x - this.px,
            y: this.y - this.py
        };
    }

    setVelocity(vx, vy) {
        this.px = this.x - vx;
        this.py = this.y - vy;
    }
}

/**
 * 约束棒类 (Verlet Distance Constraint)
 */
class PhysicsLink {
    constructor(p1, p2, targetLength = null, stiffness = 1.0) {
        this.p1 = p1;
        this.p2 = p2;
        this.targetLength = targetLength !== null ? targetLength : this.getCurrentLength();
        this.stiffness = stiffness;
    }

    getCurrentLength() {
        const dx = this.p2.x - this.p1.x;
        const dy = this.p2.y - this.p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    solve() {
        const dx = this.p2.x - this.p1.x;
        const dy = this.p2.y - this.p1.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist === 0) return;

        const diff = (this.targetLength - dist) / dist;
        // 分摊拉力
        const totalMass = this.p1.mass + this.p2.mass;
        const p1Factor = this.p2.mass / totalMass * this.stiffness;
        const p2Factor = this.p1.mass / totalMass * this.stiffness;

        const offsetX = dx * diff;
        const offsetY = dy * diff;

        this.p1.x -= offsetX * p1Factor;
        this.p1.y -= offsetY * p1Factor;
        
        this.p2.x += offsetX * p2Factor;
        this.p2.y += offsetY * p2Factor;
    }
}

/**
 * 摩托车车辆物理模型
 */
export class Motorcycle {
    constructor(startX, startY) {
        const cfg = PHYSICS_CONFIG;
        
        // 创建三个质点：后轮 (p0)，前轮 (p1)，车身重心 (p2)
        this.backWheel = new PhysicsPoint(startX - cfg.wheelbase / 2, startY, cfg.wheelRadius, cfg.wheelMass);
        this.frontWheel = new PhysicsPoint(startX + cfg.wheelbase / 2, startY, cfg.wheelRadius, cfg.wheelMass);
        
        // 车身质心具有碰撞半径，用于物理上防止穿地底盘擦地，并防止坠机误判
        this.chassis = new PhysicsPoint(startX, startY + cfg.suspensionLength * 0.9, 8, cfg.chassisMass);

        // 创建约束棒
        this.links = [
            // 轴距约束
            new PhysicsLink(this.backWheel, this.frontWheel, cfg.wheelbase, 0.95),
            // 后轮避震悬挂
            new PhysicsLink(this.backWheel, this.chassis, cfg.suspensionLength, cfg.suspensionStiffness),
            // 前轮避震悬挂
            new PhysicsLink(this.frontWheel, this.chassis, cfg.suspensionLength, cfg.suspensionStiffness)
        ];

        // 状态标识
        this.crashed = false;
        this.airTime = 0;       // 空中持续时间 (秒)
        this.totalAirTime = 0;
        this.flipAngle = 0;     // 累积空翻旋转角度 (弧度)
        this.lastAngle = this.getAngle();
        this.flipsCount = 0;    // 当前空中翻转次数
        this.isGrounded = true;
        this.jumpCooldown = 0;
        this.speed = 0;         // 摩托车当前速度
        this.checkpointIndex = 0; // 上一个存盘点在赛道点中的索引
        this.checkpointX = startX;
        this.checkpointY = startY;
        this.victory = false;
        
        // 特技翻转缓存
        this.trickName = "";
        this.trickTimer = 0;
    }

    /**
     * 重置到指定复活点
     */
    reset(x, y) {
        const cfg = PHYSICS_CONFIG;
        this.crashed = false;
        this.victory = false;
        this.airTime = 0;
        this.flipAngle = 0;
        this.flipsCount = 0;
        this.trickName = "";
        this.trickTimer = 0;

        // 重设位置
        this.backWheel.x = x - cfg.wheelbase / 2;
        this.backWheel.y = y + cfg.wheelRadius + 2;
        this.backWheel.px = this.backWheel.x;
        this.backWheel.py = this.backWheel.y;
        this.backWheel.grounded = false;

        this.frontWheel.x = x + cfg.wheelbase / 2;
        this.frontWheel.y = y + cfg.wheelRadius + 2;
        this.frontWheel.px = this.frontWheel.x;
        this.frontWheel.py = this.frontWheel.y;
        this.frontWheel.grounded = false;

        this.chassis.x = x;
        this.chassis.y = y + cfg.suspensionLength + 2;
        this.chassis.px = this.chassis.x;
        this.chassis.py = this.chassis.y;

        // 强制重新结算约束
        for (let i = 0; i < 10; i++) {
            this.links.forEach(l => l.solve());
        }
        this.lastAngle = this.getAngle();
    }

    /**
     * 获取车身整体的X坐标
     */
    getX() {
        return this.chassis.x;
    }

    /**
     * 获取车轮/车身倾角
     */
    getAngle() {
        return Math.atan2(this.frontWheel.y - this.backWheel.y, this.frontWheel.x - this.backWheel.x);
    }

    /**
     * 核心物理更新
     * @param {Object} input 按键输入 { gas, brake, tiltLeft, tiltRight, jump }
     * @param {Array} trackPoints 赛道折线点 [{x, y, price}]
     * @param {number} dt 时间间隔
     */
    update(input, trackPoints, dt) {
        if (this.crashed || this.victory) return;

        const cfg = PHYSICS_CONFIG;
        if (this.jumpCooldown > 0) this.jumpCooldown--;

        // 1. 应用 Verlet 积分速度与重力
        this.backWheel.update(cfg.gravity, cfg.dampening);
        this.frontWheel.update(cfg.gravity, cfg.dampening);
        this.chassis.update(cfg.gravity, cfg.dampening);

        // 2. 计算当前是否在地面
        this.isGrounded = this.backWheel.grounded || this.frontWheel.grounded;

        // 3. 处理按键操控力
        this.applyControls(input, trackPoints);
        
        // 3.5 应用空中物理角阻尼
        this.applyAirDamping();

        // 4. 解除刚性距离约束 (Relaxation iterations)
        for (let i = 0; i < 6; i++) {
            this.links.forEach(l => l.solve());
        }

        // 4.5 防止车身折叠到车轮下方 (Hammock/inside-out prevention)
        const wbx = this.frontWheel.x - this.backWheel.x;
        const wby = this.frontWheel.y - this.backWheel.y;
        const wbLen = Math.sqrt(wbx * wbx + wby * wby);
        if (wbLen > 0) {
            const nx = -wby / wbLen;
            const ny = wbx / wbLen;
            const wcx = this.chassis.x - this.backWheel.x;
            const wcy = this.chassis.y - this.backWheel.y;
            const proj = wcx * nx + wcy * ny;
            const targetProj = 12; // 确保底盘中心始终在车轴线上方至少 12px
            if (proj < targetProj) {
                const diff = targetProj - proj;
                const shiftX = nx * diff;
                const shiftY = ny * diff;
                this.chassis.x += shiftX;
                this.chassis.y += shiftY;
                this.chassis.px += shiftX;
                this.chassis.py += shiftY;
            }
        }

        // 5. 碰撞检测与响应 (与折线赛道)
        this.resolveCollisions(trackPoints);

        // 重新计算落地状态
        const wasGrounded = this.isGrounded;
        this.isGrounded = this.backWheel.grounded || this.frontWheel.grounded;

        // 计算车速 (以轴中点当前帧和前一帧的位移计算)
        const currentCenterX = (this.backWheel.x + this.frontWheel.x) / 2;
        const prevCenterX = (this.backWheel.px + this.frontWheel.px) / 2;
        const currentCenterY = (this.backWheel.y + this.frontWheel.y) / 2;
        const prevCenterY = (this.backWheel.py + this.frontWheel.py) / 2;
        const dx = currentCenterX - prevCenterX;
        const dy = currentCenterY - prevCenterY;
        this.speed = Math.sqrt(dx * dx + dy * dy);

        // 6. 空中特技与翻滚角度计算
        this.updateStunts(wasGrounded, dt);
        
        // 7. 坠车/碰撞判定
        this.checkCrashes(trackPoints);
        
        this.lastAngle = this.getAngle();
    }

    /**
     * 空中物理角阻尼机制，限制角速度防止无限二次方加速自旋
     */
    applyAirDamping() {
        if (!this.isGrounded) {
            const currentAngle = this.getAngle();
            let diff = currentAngle - this.lastAngle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;

            // 恢复/阻尼力矩，正比于负角速度差
            // 阻尼系数基于 wheelbase=36 计算得到 (0.3 * wheelbase / 2 = 5.4)
            const rotDamp = 5.4;
            const torque = -diff * rotDamp;
            
            const angle = currentAngle + Math.PI / 2;
            const tx = Math.cos(angle) * torque;
            const ty = Math.sin(angle) * torque;

            this.frontWheel.x += tx;
            this.frontWheel.y += ty;
            this.backWheel.x -= tx;
            this.backWheel.y -= ty;
        }
    }

    /**
     * 处理按键驾驶动作
     */
    applyControls(input, trackPoints) {
        const cfg = PHYSICS_CONFIG;
        
        // 抬车头 & 压车头 (空中或地面都可以压，空中效果更明显)
        if (input.tiltLeft) {
            // 抬车头 (后翻): 逆时针力矩
            const angle = this.getAngle() + Math.PI / 2;
            const torque = this.isGrounded ? cfg.tiltTorque : cfg.tiltTorque * 3.0; // 空中控制力增加3倍
            const tx = Math.cos(angle) * torque;
            const ty = Math.sin(angle) * torque;

            this.frontWheel.x += tx;
            this.frontWheel.y += ty;
            this.backWheel.x -= tx;
            this.backWheel.y -= ty;

            // 给车身质心一个反向支撑力，使其空中旋转更平滑
            this.chassis.setVelocity(
                (this.chassis.x - this.chassis.px) + tx * 0.2,
                (this.chassis.y - this.chassis.py) + ty * 0.2
            );
        }
        if (input.tiltRight) {
            // 压车头 (前翻): 顺时针力矩
            const angle = this.getAngle() + Math.PI / 2;
            const torque = this.isGrounded ? cfg.tiltTorque : cfg.tiltTorque * 3.0; // 空中控制力增加3倍
            const tx = Math.cos(angle) * torque;
            const ty = Math.sin(angle) * torque;

            this.frontWheel.x -= tx;
            this.frontWheel.y -= ty;
            this.backWheel.x += tx;
            this.backWheel.y += ty;

            this.chassis.setVelocity(
                (this.chassis.x - this.chassis.px) - tx * 0.2,
                (this.chassis.y - this.chassis.py) - ty * 0.2
            );
        }

        // 加速 (油门): 只有后轮着地时应用加速力
        if (input.gas) {
            if (this.backWheel.grounded) {
                // 加速方向沿后轮触地处的地面切线
                const tx = this.backWheel.normalY; // 法线顺时针90度即向前切线
                const ty = -this.backWheel.normalX;
                
                // 按质量比例分配推力，使所有质点获得完全相同的加速度（等于 enginePower），避免引入任何旋转力矩
                this.backWheel.x += tx * cfg.enginePower * this.backWheel.mass;
                this.backWheel.y += ty * cfg.enginePower * this.backWheel.mass;

                this.frontWheel.x += tx * cfg.enginePower * this.frontWheel.mass;
                this.frontWheel.y += ty * cfg.enginePower * this.frontWheel.mass;

                this.chassis.x += tx * cfg.enginePower * this.chassis.mass;
                this.chassis.y += ty * cfg.enginePower * this.chassis.mass;
            } else {
                // 空中空油门给一个极微弱的后转扭矩 (模拟陀螺效应)
                const angle = this.getAngle() + Math.PI / 2;
                this.frontWheel.x += Math.cos(angle) * cfg.tiltTorque * 0.2;
                this.frontWheel.y += Math.sin(angle) * cfg.tiltTorque * 0.2;
            }
        }

        // 减速 / 刹车 / 倒车
        if (input.brake) {
            if (this.backWheel.grounded || this.frontWheel.grounded) {
                // 刹车衰减速度
                const vx_b = (this.backWheel.x - this.backWheel.px) * (1 - cfg.brakingPower);
                const vy_b = (this.backWheel.y - this.backWheel.py) * (1 - cfg.brakingPower);
                const vx_f = (this.frontWheel.x - this.frontWheel.px) * (1 - cfg.brakingPower);
                const vy_f = (this.frontWheel.y - this.frontWheel.py) * (1 - cfg.brakingPower);
                
                this.backWheel.setVelocity(vx_b, vy_b);
                this.frontWheel.setVelocity(vx_f, vy_f);
            }
        }

        // 跳跃 (Jump)
        if (input.jump && (this.backWheel.grounded || this.frontWheel.grounded) && this.jumpCooldown === 0) {
            // 平均法线方向向上跳起
            let nx = 0, ny = 1;
            if (this.backWheel.grounded) {
                nx += this.backWheel.normalX;
                ny += this.backWheel.normalY;
            }
            if (this.frontWheel.grounded) {
                nx += this.frontWheel.normalX;
                ny += this.frontWheel.normalY;
            }
            // 归一化
            const len = Math.sqrt(nx * nx + ny * ny);
            nx /= len;
            ny /= len;

            // 给三个质点同时施加向上弹起的瞬时位移
            const imp = cfg.jumpImpulse;
            this.chassis.y += ny * imp * 1.8;
            this.chassis.x += nx * imp * 0.5;
            this.backWheel.y += ny * imp;
            this.frontWheel.y += ny * imp;

            this.jumpCooldown = 25; // 防止连续触发
        }
    }

    /**
     * 解决质点与折线地面的碰撞
     */
    resolveCollisions(trackPoints) {
        const cfg = PHYSICS_CONFIG;
        
        // 重设接地状态，在开始本次碰撞计算前
        this.backWheel.grounded = false;
        this.frontWheel.grounded = false;
        
        // 分别为后轮、前轮以及车身质心进行碰撞计算
        this.resolvePointCollision(this.backWheel, trackPoints);
        this.resolvePointCollision(this.frontWheel, trackPoints);
        this.resolvePointCollision(this.chassis, trackPoints);
    }

    /**
     * 单个车轮质点的碰撞检测
     */
    resolvePointCollision(p, trackPoints) {
        // 1. 查找当前质点 x 所在的赛道段
        const idx = this.findSegmentIndex(p.x, trackPoints);
        if (idx === -1) return; // 越界

        // 检查当前点 x 周围的最多 3 个赛道段，防止卡在折线转角处 (Polyline corner trapping)
        const startIdx = Math.max(0, idx - 1);
        const endIdx = Math.min(trackPoints.length - 2, idx + 1);

        for (let j = startIdx; j <= endIdx; j++) {
            this.resolvePointSegmentCollision(p, trackPoints, j);
        }
    }

    /**
     * 单个质点与单个赛道段的实际碰撞响应
     */
    resolvePointSegmentCollision(p, trackPoints, idx) {
        const cfg = PHYSICS_CONFIG;
        const R = p.radius;

        const A = trackPoints[idx];
        const B = trackPoints[idx + 1];

        // 计算点 P 到线段 AB 的最近点 C
        const abX = B.x - A.x;
        const abY = B.y - A.y;
        const apX = p.x - A.x;
        const apY = p.y - A.y;

        const abLenSq = abX * abX + abY * abY;
        if (abLenSq === 0) return;

        // 投影比例 t
        let t = (apX * abX + apY * abY) / abLenSq;
        t = Math.max(0, Math.min(1, t)); // 夹紧在 [0, 1]

        // 最近点坐标
        const cX = A.x + t * abX;
        const cY = A.y + t * abY;

        // 点到线段最近点的距离
        const dx = p.x - cX;
        const dy = p.y - cY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 计算地面法线 (由 A 指向 B 的切线，逆时针旋转 90 度为法线，指向地面上方)
        const abLen = Math.sqrt(abLenSq);
        const normalX = -abY / abLen;
        const normalY = abX / abLen;

        const proj = dx * normalX + dy * normalY;

        // 判定碰撞：如果最近点在端点，使用欧氏距离；如果最近点在段内，使用法向投影距离
        let collided = false;
        let colNormalX = normalX;
        let colNormalY = normalY;
        let depth = 0;

        if (t === 0 || t === 1) {
            // 只允许在轮子处于顶点对应段的合理半空间内进行顶点碰撞，避免从相邻段判定时产生向后的阻力 (Ghost Collision)
            const isStartVertex = (t === 0);
            const vertexX = isStartVertex ? A.x : B.x;
            const isLogicalOwner = isStartVertex ? (p.x >= vertexX) : (p.x <= vertexX);

            if (isLogicalOwner) {
                // 判定该端点是否为凹角。如果是凹角，则忽略顶点碰撞，完全依赖相邻段的内侧碰撞，防止产生“虚假阻挡”
                const vertexIdx = isStartVertex ? idx : idx + 1;
                let isConcave = false;
                if (vertexIdx > 0 && vertexIdx < trackPoints.length - 1) {
                    const P_prev = trackPoints[vertexIdx - 1];
                    const P_curr = trackPoints[vertexIdx];
                    const P_next = trackPoints[vertexIdx + 1];
                    const v1x = P_curr.x - P_prev.x;
                    const v1y = P_curr.y - P_prev.y;
                    const v2x = P_next.x - P_curr.x;
                    const v2y = P_next.y - P_curr.y;
                    // 二维向量外积：若为正值，说明从v1转向v2为逆时针，在我们的+y向上坐标系中，这对应一个凹角（山谷）
                    const cross = v1x * v2y - v1y * v2x;
                    if (cross > 0) {
                        isConcave = true;
                    }
                }

                if (!isConcave) {
                    if (dist < R && dist > 0) {
                        collided = true;
                        colNormalX = dx / dist;
                        colNormalY = dy / dist;
                        depth = R - dist;
                    } else if (dist === 0) {
                        collided = true;
                        colNormalX = normalX;
                        colNormalY = normalY;
                        depth = R;
                    }
                }
            }
        } else {
            if (proj < R) {
                collided = true;
                colNormalX = normalX;
                colNormalY = normalY;
                depth = R - proj;
            }
        }

        if (collided) {
            if (p.y > 500 && idx === 6) {
                console.log(`[PHYSICS COLLISION DEBUG] p.x=${p.x.toFixed(2)}, p.y=${p.y.toFixed(2)}, idx=${idx}, t=${t.toFixed(2)}, proj=${proj.toFixed(2)}, depth=${depth.toFixed(2)}, colNormalY=${colNormalY.toFixed(2)}`);
            }
            p.grounded = true;
            p.normalX = colNormalX;
            p.normalY = colNormalY;

            // 首先，计算推出前的真实物理速度 (防止将位置修正计算入速度中)
            const vx = p.x - p.px;
            const vy = p.y - p.py;

            // 推出位置修正
            p.x += colNormalX * depth;
            p.y += colNormalY * depth;
            
            // 同步移动 px, py 保持相对速度不变，避免引入虚假速度导致飞天
            p.px += colNormalX * depth;
            p.py += colNormalY * depth;

            // 现在计算碰撞反应后的速度变化 (反弹与滑动摩擦力)
            const vNormal = vx * colNormalX + vy * colNormalY;
            const tangentX = colNormalY;
            const tangentY = -colNormalX;
            const vTangent = vx * tangentX + vy * tangentY;

            // 切向始终应用地面摩擦力
            const newVTangent = vTangent * (1 - cfg.groundFriction);

            // 法向仅在向地面方向运动时应用反弹，否则保持原有法向运动状态
            const newVNormal = vNormal < 0 ? -vNormal * cfg.bounce : vNormal;

            // 合成新速度
            const newVx = colNormalX * newVNormal + tangentX * newVTangent;
            const newVy = colNormalY * newVNormal + tangentY * newVTangent;

            // 更新 Verlet 隐式速度 (px = x - v)
            p.px = p.x - newVx;
            p.py = p.y - newVy;
        }
    }

    /**
     * 二分法查找 x 所在的赛道段索引
     */
    findSegmentIndex(x, trackPoints) {
        const len = trackPoints.length;
        if (len < 2 || x < trackPoints[0].x || x > trackPoints[len - 1].x) {
            // 到达终点
            if (x >= trackPoints[len - 1].x) {
                this.victory = true;
            }
            return -1;
        }

        let low = 0;
        let high = len - 2;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (x >= trackPoints[mid].x && x <= trackPoints[mid + 1].x) {
                return mid;
            } else if (x < trackPoints[mid].x) {
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
        return -1;
    }

    /**
     * 更新空中特技积分
     */
    updateStunts(wasGrounded, dt) {
        if (!this.isGrounded) {
            // 空中状态，计时
            this.airTime += dt;
            this.totalAirTime += dt;

            // 累加车身旋转弧度
            const currentAngle = this.getAngle();
            let diff = currentAngle - this.lastAngle;

            // 处理 -PI 到 PI 的跨越翻转
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;

            this.flipAngle += diff;
            this.lastAngle = currentAngle;

            // 检查空翻判定 (2*PI 为一周，由于操作手感，给一点宽容度，比如 5.8 弧度)
            const radiansPerFlip = Math.PI * 2 * 0.92;
            if (Math.abs(this.flipAngle) >= radiansPerFlip * (this.flipsCount + 1)) {
                this.flipsCount++;
                const isBackflip = this.flipAngle > 0;
                
                // 设置触发的特技
                this.trickName = isBackflip 
                    ? (this.flipsCount === 1 ? "后空翻! Backflip! +500" : `双重后空翻! Double Backflip! +1000`)
                    : (this.flipsCount === 1 ? "前空翻! Frontflip! +500" : `双重前空翻! Double Frontflip! +1000`);
                
                this.trickTimer = 1.5; // 提示显示 1.5 秒
                
                // 广播特技得分事件 (由 game.js 捕获并加分)
                const event = new CustomEvent("stonkrider-trick", {
                    detail: { points: this.flipsCount * 500, name: this.trickName }
                });
                window.dispatchEvent(event);
            }
        } else {
            // 触地瞬间
            if (!wasGrounded) {
                // 从空中刚落地，如果有大空翻，可以给落地完美度评价（这里可以加小动画）
                this.flipAngle = 0;
                this.flipsCount = 0;
                this.airTime = 0;
            }
            this.lastAngle = this.getAngle();
        }

        // 更新特效文字倒计时
        if (this.trickTimer > 0) {
            this.trickTimer -= dt;
            if (this.trickTimer <= 0) {
                this.trickName = "";
            }
        }
    }

    /**
     * 检测坠毁碰撞 (Chassis碰撞或倒栽葱)
     */
    checkCrashes(trackPoints) {
        if (this.crashed) return;

        // 1. 如果车本质心离地面太近，视为坠车
        const cIdx = this.findSegmentIndex(this.chassis.x, trackPoints);
        if (cIdx !== -1) {
            const A = trackPoints[cIdx];
            const B = trackPoints[cIdx + 1];
            const t = (this.chassis.x - A.x) / (B.x - A.x);
            const gY = A.y + t * (B.y - A.y);

            // 质心距离地面高度
            const heightAboveGround = this.chassis.y - gY;
            if (heightAboveGround < 5) { // 过于贴近地面，车头砸地或人头砸地，配合底盘碰撞设定为5
                this.triggerCrash("坠车! (Wrecked)");
                return;
            }
        }

        // 2. 如果倒过来了 (前后轮连线斜率很大，或者倾角在颠倒范围：90度到270度之间)，且任一轮触地，判定为摔车
        const angle = this.getAngle();
        // 斜度绝对值，Math.PI 为完全颠倒。如果角度绝对值 > PI * 0.65 弧度 (约 117 度)，判定倒车
        if (Math.abs(angle) > Math.PI * 0.68) {
            if (this.backWheel.grounded || this.frontWheel.grounded) {
                this.triggerCrash("翻车! (Flipped)");
            }
        }
    }

    triggerCrash(reason) {
        this.crashed = true;
        
        // 广播坠车事件
        const event = new CustomEvent("stonkrider-crash", {
            detail: { reason: reason }
        });
        window.dispatchEvent(event);
    }
}
