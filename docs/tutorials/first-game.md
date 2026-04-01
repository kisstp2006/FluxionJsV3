# First Game Tutorial

Welcome to your first game development experience with FluxionJS V3! This tutorial will guide you through creating a simple 3D game from scratch, teaching you the fundamental concepts and workflows of the engine.

## 🎮 Game Overview

We'll create a simple **3D Ball Rolling Game** where:
- The player controls a ball that rolls around a platform
- The goal is to collect glowing orbs while avoiding falling off the platform
- The game features physics, input handling, and basic UI

## 🚀 Getting Started

### Prerequisites

- FluxionJS V3 engine installed and running
- Basic understanding of 3D concepts (helpful but not required)
- Familiarity with TypeScript/JavaScript (helpful but not required)

### Step 1: Create New Project

1. **Launch FluxionJS Editor**
   ```bash
   npm start
   ```

2. **Create New Project**
   - Click **"New Project"**
   - Enter project name: `BallRoller`
   - Click **"Create"**

3. **Explore the Editor**
   - **Hierarchy Panel** (left): Shows scene entities
   - **Viewport** (center): 3D scene view
   - **Inspector** (right): Entity properties
   - **Asset Browser** (bottom left): Project assets

## 🏗️ Building the Scene

### Step 2: Create the Platform

1. **Add Platform Entity**
   - Right-click in **Hierarchy** → **"Create Empty"**
   - Rename entity to `Platform`
   - Select `Platform` entity

2. **Add Transform Component**
   - In **Inspector**, click **"Add Component"**
   - Select **"Transform"**
   - Set **Position**: `X: 0, Y: 0, Z: 0`
   - Set **Scale**: `X: 10, Y: 1, Z: 10`

3. **Add Mesh Renderer**
   - Click **"Add Component"** → **"Mesh Renderer"**
   - Click **"Create Mesh"** → **"Box"**
   - Click **"Create Material"** → **"Standard"**
   - Set material **Color**: Light gray (`#cccccc`)

### Step 3: Create the Player Ball

1. **Add Player Entity**
   - Right-click in **Hierarchy** → **"Create Empty"**
   - Rename to `Player`
   - Set **Position**: `X: 0, Y: 2, Z: 0`

2. **Add Ball Components**
   - **Transform**: Set **Scale** to `X: 0.5, Y: 0.5, Z: 0.5`
   - **Mesh Renderer**: Create **Sphere** mesh with blue material
   - **RigidBody**: 
     - Set **Mass**: `1.0`
     - Set **Body Type**: `Dynamic`
     - Enable **Use Gravity**

3. **Add Sphere Collider**
   - **Add Component** → **"Sphere Collider"**
   - Set **Radius**: `0.5`

### Step 4: Add Camera

1. **Create Camera Entity**
   - **Hierarchy** → **"Create Empty"**
   - Rename to `Main Camera`
   - Set **Position**: `X: 0, Y: 8, Z: 10`
   - Set **Rotation**: `X: -30, Y: 0, Z: 0`

2. **Add Camera Component**
   - **Add Component** → **"Camera"**
   - Set **Field of View**: `60`
   - Set **Background Color**: Sky blue (`#87ceeb`)

## 🎯 Creating Game Logic

### Step 5: Create Player Controller Script

1. **Create Script File**
   - **Asset Browser** → **Right-click** → **"Create"** → **"Script"**
   - Name: `PlayerController`
   - Choose **TypeScript** template
   - Click **"Create"**

2. **Write the Script**

```typescript
// PlayerController.ts
export default class PlayerController extends FluxionBehaviour {
  @field({ type: 'number', label: 'Move Speed' })
  moveSpeed = 10.0;

  @field({ type: 'number', label: 'Jump Force' })
  jumpForce = 5.0;

  @field({ type: 'entityRef', label: 'Camera' })
  camera = new EntityRef('Camera');

  private _rigidbody: RigidBodyComponent | null = null;
  private _isGrounded = false;

  start() {
    // Get rigidbody component
    this._rigidbody = this.getComponent('RigidBody');
    
    this.log('Player controller initialized');
  }

  update(dt: number) {
    if (!this._rigidbody) return;

    // Handle input
    this.handleMovement(dt);
    this.handleJump();
    
    // Check if grounded
    this._isGrounded = this.checkGrounded();
  }

  private handleMovement(dt: number) {
    // Get input axes
    const horizontal = this.Input.getAxis('KeyA', 'KeyD');
    const vertical = this.Input.getAxis('KeyS', 'KeyW');

    // Calculate movement direction
    const moveDirection = new THREE.Vector3(horizontal, 0, vertical);
    moveDirection.normalize();

    // Apply force in world space
    const force = moveDirection.multiplyScalar(this.moveSpeed);
    this._rigidbody.addForce(force);
  }

  private handleJump() {
    if (this.Input.isKeyPressed('Space') && this._isGrounded) {
      // Apply upward impulse
      const jumpImpulse = new THREE.Vector3(0, this.jumpForce, 0);
      this._rigidbody.applyImpulse(jumpImpulse);
    }
  }

  private checkGrounded(): boolean {
    // Raycast downward to check for ground
    const rayStart = this.transform.position.clone();
    const rayEnd = rayStart.clone().add(new THREE.Vector3(0, -1.5, 0));

    const hit = this.Physics.raycast(rayStart, rayEnd);
    return hit !== null;
  }
}
```

3. **Attach Script to Player**
   - Select `Player` entity
   - **Inspector** → **"Add Component"** → **"Behaviour"**
   - Click **"Select Script"** → Choose `PlayerController`
   - Configure properties in inspector

### Step 6: Create Collectible Orbs

1. **Create Orb Prefab**
   - **Hierarchy** → **"Create Empty"**
   - Rename to `CollectibleOrb`
   - **Transform**: Position `X: 0, Y: 1, Z: 0`, Scale `X: 0.3, Y: 0.3, Z: 0.3`
   - **Mesh Renderer**: Sphere mesh with yellow material
   - **Add Component**: **"Point Light"** with yellow color

2. **Create Collection Script**

```typescript
// CollectibleOrb.ts
export default class CollectibleOrb extends FluxionBehaviour {
  @field({ type: 'number', label: 'Rotation Speed' })
  rotationSpeed = 90.0;

  @field({ type: 'number', label: 'Float Height' })
  floatHeight = 0.5;

  @field({ type: 'number', label: 'Float Speed' })
  floatSpeed = 2.0;

  private _startY = 0;
  private _time = 0;

  start() {
    this._startY = this.transform.position.y;
  }

  update(dt: number) {
    // Rotate the orb
    this.transform.rotation.y += this.rotationSpeed * dt;

    // Float up and down
    this._time += dt;
    const floatOffset = Math.sin(this._time * this.floatSpeed) * this.floatHeight;
    this.transform.position.y = this._startY + floatOffset;

    // Check for player collision
    this.checkPlayerCollision();
  }

  private checkPlayerCollision() {
    const player = this.findEntityWithTag('Player');
    if (!player) return;

    const playerTransform = this.getComponentOf(player, 'Transform');
    if (!playerTransform) return;

    const distance = this.transform.position.distanceTo(playerTransform.position);
    
    if (distance < 1.0) {
      this.collect();
    }
  }

  private collect() {
    // Play collection effect
    this.Audio.playSound('collect.wav', this.transform.position);
    
    // Notify game manager
    this.emit('OrbCollected', { position: this.transform.position });
    
    // Destroy this orb
    this.destroyEntity(this.entity);
  }
}
```

3. **Create Prefab**
   - Select `CollectibleOrb` entity
   - **Asset Browser** → **Right-click** → **"Create Prefab"**
   - Name: `CollectibleOrb`
   - Delete the scene entity (we'll use the prefab)

### Step 7: Create Game Manager

1. **Create Game Manager Entity**
   - **Hierarchy** → **"Create Empty"**
   - Rename to `GameManager`

2. **Create Game Manager Script**

```typescript
// GameManager.ts
export default class GameManager extends FluxionBehaviour {
  @field({ type: 'number', label: 'Orbs to Collect' })
  totalOrbs = 5;

  @field({ type: 'number', label: 'Current Score' })
  currentScore = 0;

  private _orbsCollected = 0;

  start() {
    // Spawn orbs
    this.spawnOrbs();
    
    // Listen for collection events
    this.on('OrbCollected', (data) => {
      this.onOrbCollected(data);
    });

    this.log('Game manager initialized');
  }

  private spawnOrbs() {
    for (let i = 0; i < this.totalOrbs; i++) {
      // Random position on platform
      const x = (Math.random() - 0.5) * 8;
      const z = (Math.random() - 0.5) * 8;
      const position = new THREE.Vector3(x, 1, z);

      // Spawn orb from prefab
      const orb = this.spawnPrefab('CollectibleOrb', position);
    }
  }

  private onOrbCollected(data: any) {
    this._orbsCollected++;
    this.currentScore += 100;
    
    this.log(`Orb collected! Score: ${this.currentScore}`);

    // Check win condition
    if (this._orbsCollected >= this.totalOrbs) {
      this.onGameWin();
    }
  }

  private onGameWin() {
    this.log('You Win! All orbs collected!');
    
    // Display win message
    this.Debug.drawText(new Vec2(400, 300), 'YOU WIN!', '#00ff00', 48);
    
    // Restart game after delay
    setTimeout(() => {
      this.restartGame();
    }, 3000);
  }

  private restartGame() {
    // Reset score
    this.currentScore = 0;
    this._orbsCollected = 0;
    
    // Clear existing orbs
    const orbs = this.findEntitiesWithTag('Collectible');
    for (const orb of orbs) {
      this.destroyEntity(orb);
    }
    
    // Spawn new orbs
    this.spawnOrbs();
  }
}
```

3. **Attach Script**
   - Select `GameManager` entity
   - **Add Component** → **"Behaviour"**
   - Select `GameManager` script

## 🎨 Adding Visual Polish

### Step 8: Create Materials

1. **Platform Material**
   - Select platform mesh renderer
   - Click material → **"Edit Material"**
   - Set **Color**: `#808080`
   - Set **Metallic**: `0.0`
   - Set **Roughness**: `0.8`

2. **Ball Material**
   - Select player mesh renderer
   - Edit material
   - Set **Color**: `#0066cc`
   - Set **Metallic**: `0.2`
   - Set **Roughness**: `0.3`

### Step 9: Add Lighting

1. **Directional Light**
   - **Hierarchy** → **"Create Empty"**
   - Rename to `Sun Light`
   - **Add Component** → **"Directional Light"**
   - Set **Rotation**: `X: -45, Y: -45, Z: 0`
   - Set **Intensity**: `2.0`
   - Set **Color**: White (`#ffffff`)

2. **Environment Lighting**
   - Select `Sun Light`
   - **Add Component** → **"Environment"**
   - Set **Sky Color**: Light blue (`#87ceeb`)
   - Set **Ground Color**: Dark blue (`#1e3a8a`)

## 🎮 Testing the Game

### Step 10: Play Test

1. **Start Game**
   - Click **▶️ Play** button in toolbar
   - Or press **Ctrl+P**

2. **Test Controls**
   - **WASD**: Move the ball
   - **Space**: Jump
   - **Mouse**: Look around (if camera follow is added)

3. **Test Gameplay**
   - Roll around the platform
   - Collect yellow orbs
   - Try not to fall off
   - Win by collecting all orbs

### Step 11: Debug Issues

If something doesn't work:

1. **Check Console**
   - Open **Console** panel
   - Look for error messages
   - Check script compilation errors

2. **Verify Components**
   - Ensure all entities have required components
   - Check script references in inspector
   - Verify prefab connections

3. **Test Physics**
   - Check collider sizes and positions
   - Verify rigidbody settings
   - Ensure physics world is enabled

## 📦 Building the Game

### Step 12: Export Game

1. **Open Build Panel**
   - **Bottom Panel** → **"Build"** tab

2. **Configure Settings**
   - **Game Name**: `Ball Roller`
   - **Version**: `1.0.0`
   - **Start Scene**: `Main Scene`
   - **Output Directory**: `Build/Web`
   - Enable **Minify** for release build

3. **Build Game**
   - Click **"Build"** button
   - Wait for build completion
   - Click **"Open Output"** to view results

4. **Test Build**
   - Open local web server in build directory
   ```bash
   cd Build/Web
   python -m http.server 8080
   ```
   - Open `http://localhost:8080` in browser

## 🎯 Next Steps

Congratulations! You've created your first game with FluxionJS V3. Here are some ideas for extending it:

### Advanced Features

1. **UI System**
   - Add score display
   - Create start menu
   - Add game over screen

2. **Visual Effects**
   - Particle effects for collection
   - Camera shake on jump
   - Trail effects for movement

3. **Audio**
   - Background music
   - Sound effects for actions
   - Spatial audio for orbs

4. **Game Mechanics**
   - Moving platforms
   - Enemy obstacles
   - Power-ups and abilities

### Learning Resources

- [Scripting Overview](../scripting/overview.md) - Learn more about scripting
- [Component Reference](../engine/components.md) - Explore built-in components
- [Physics System](../engine/physics.md) - Advanced physics features
- [Material Editor](../editor/material-editor.md) - Create visual materials

## 🎉 Conclusion

You've successfully:
- ✅ Created a 3D scene with entities and components
- ✅ Implemented player controls with physics
- ✅ Added collectible objects with behaviors
- ✅ Created a game manager for game logic
- ✅ Built and exported your game

This tutorial covered the fundamental workflows of FluxionJS V3. From here, you can explore more advanced features, create more complex games, and dive deeper into specific systems that interest you.

Happy game development! 🚀
