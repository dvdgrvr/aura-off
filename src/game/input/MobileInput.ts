export class MobileInputManager {
  private static instance: MobileInputManager;

  public isMobile: boolean = false;
  
  // Joystick State
  public stickVector = { x: 0, y: 0 };
  
  // Action/Charge Button
  public chargeIsDown: boolean = false;
  public _chargeWasDown: boolean = false;
  public chargeJustUp: boolean = false;
  
  // Skill Button
  public skillIsDown: boolean = false;
  public _skillWasDown: boolean = false;
  public skillJustDown: boolean = false;

  private joystickBase: HTMLElement | null = null;
  private joystickNub: HTMLElement | null = null;
  private chargeBtn: HTMLElement | null = null;
  private skillBtn: HTMLElement | null = null;
  
  private stickCenter = { x: 0, y: 0 };
  private stickMaxRadius = 50;
  private stickPointerId: number | null = null;
  
  private constructor() {
    this.isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  public static getInstance(): MobileInputManager {
    if (!MobileInputManager.instance) {
      MobileInputManager.instance = new MobileInputManager();
    }
    return MobileInputManager.instance;
  }

  public init() {
    if (!this.isMobile) return;

    const controlsOverlay = document.getElementById("mobile-controls");
    if (controlsOverlay) {
      controlsOverlay.style.display = "flex";
    }

    this.joystickBase = document.getElementById("mobile-joystick");
    this.joystickNub = document.getElementById("mobile-joystick-nub");
    this.chargeBtn = document.getElementById("mobile-btn-charge");
    this.skillBtn = document.getElementById("mobile-btn-skill");

    window.addEventListener("resize", () => {
      if (this.joystickBase && this.stickPointerId === null) {
        this.resetJoystick();
      }
    });

    if (this.joystickBase) {
      this.joystickBase.addEventListener("pointerdown", (e) => this.onJoystickPointerDown(e));
      window.addEventListener("pointermove", (e) => this.onJoystickPointerMove(e));
      window.addEventListener("pointerup", (e) => this.onJoystickPointerUp(e));
      window.addEventListener("pointercancel", (e) => this.onJoystickPointerUp(e));
    }

    if (this.chargeBtn) {
      this.chargeBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.chargeIsDown = true;
        this.chargeBtn?.classList.add("active");
      });
      this.chargeBtn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        this.chargeIsDown = false;
        this.chargeBtn?.classList.remove("active");
      });
      this.chargeBtn.addEventListener("pointercancel", (e) => {
        e.preventDefault();
        this.chargeIsDown = false;
        this.chargeBtn?.classList.remove("active");
      });
    }

    if (this.skillBtn) {
      this.skillBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.skillIsDown = true;
        this.skillBtn?.classList.add("active");
      });
      this.skillBtn.addEventListener("pointerup", (e) => {
        e.preventDefault();
        this.skillIsDown = false;
        this.skillBtn?.classList.remove("active");
      });
      this.skillBtn.addEventListener("pointercancel", (e) => {
        e.preventDefault();
        this.skillIsDown = false;
        this.skillBtn?.classList.remove("active");
      });
    }
  }

  /**
   * Must be called once per frame by the game loop
   * to update 'justUp' and 'justDown' states.
   */
  public update() {
    if (!this.isMobile) return;

    this.chargeJustUp = !this.chargeIsDown && this._chargeWasDown;
    this._chargeWasDown = this.chargeIsDown;

    this.skillJustDown = this.skillIsDown && !this._skillWasDown;
    this._skillWasDown = this.skillIsDown;
  }

  private onJoystickPointerDown(e: PointerEvent) {
    if (this.stickPointerId !== null) return; // Already tracking
    e.preventDefault();
    this.stickPointerId = e.pointerId;
    
    // Calculate center based on base element
    const rect = this.joystickBase!.getBoundingClientRect();
    this.stickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    this.updateJoystick(e.clientX, e.clientY);
  }

  private onJoystickPointerMove(e: PointerEvent) {
    if (this.stickPointerId !== e.pointerId) return;
    e.preventDefault();
    this.updateJoystick(e.clientX, e.clientY);
  }

  private onJoystickPointerUp(e: PointerEvent) {
    if (this.stickPointerId !== e.pointerId) return;
    e.preventDefault();
    this.stickPointerId = null;
    this.resetJoystick();
  }

  private updateJoystick(px: number, py: number) {
    let dx = px - this.stickCenter.x;
    let dy = py - this.stickCenter.y;
    const distance = Math.hypot(dx, dy);

    if (distance > this.stickMaxRadius) {
      dx = (dx / distance) * this.stickMaxRadius;
      dy = (dy / distance) * this.stickMaxRadius;
    }

    if (this.joystickNub) {
      this.joystickNub.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Normalized vector between -1 and 1
    const normDist = Math.hypot(dx / this.stickMaxRadius, dy / this.stickMaxRadius);
    if (normDist > 0.1) { // deadzone
      this.stickVector.x = dx / this.stickMaxRadius;
      this.stickVector.y = dy / this.stickMaxRadius;
    } else {
      this.stickVector.x = 0;
      this.stickVector.y = 0;
    }
  }

  private resetJoystick() {
    this.stickVector.x = 0;
    this.stickVector.y = 0;
    if (this.joystickNub) {
      this.joystickNub.style.transform = `translate(0px, 0px)`;
    }
  }
}

export const MobileInput = MobileInputManager.getInstance();
