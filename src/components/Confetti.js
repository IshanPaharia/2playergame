'use client';

import React, { useEffect, useRef } from 'react';

export default function Confetti() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Set canvas dimensions
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Confetti particles
    const particles = [];
    const colors = ['#00f2fe', '#7f00ff', '#39ff14', '#ff007f', '#ff8c00', '#ffff00'];

    class ConfettiParticle {
      constructor() {
        this.x = Math.random() * canvas.width;
        // Start below the screen
        this.y = canvas.height + Math.random() * 50;
        this.size = Math.random() * 8 + 4;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        
        // Speed
        this.speedX = Math.random() * 6 - 3;
        this.speedY = -Math.random() * 15 - 10; // Launch upwards
        this.gravity = 0.3;
        this.rotation = Math.random() * 360;
        this.rotationSpeed = Math.random() * 10 - 5;
        this.opacity = 1;
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.speedY += this.gravity;
        this.rotation += this.rotationSpeed;
        
        // Slow down opacity when falling down past middle screen
        if (this.speedY > 0) {
          this.opacity -= 0.005;
        }
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate((this.rotation * Math.PI) / 180);
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.opacity;
        ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        ctx.restore();
      }
    }

    // Initialize particles
    for (let i = 0; i < 150; i++) {
      // Stagger spawn times
      setTimeout(() => {
        if (canvasRef.current) {
          particles.push(new ConfettiParticle());
        }
      }, Math.random() * 2000);
    }

    // Animation Loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        p.draw();

        // Remove dead particles
        if (p.opacity <= 0 || p.y > canvas.height + 100) {
          // Recycle
          particles[i] = new ConfettiParticle();
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return <canvas ref={canvasRef} className="confetti-canvas" />;
}
