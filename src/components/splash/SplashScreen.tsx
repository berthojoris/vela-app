import React, { useEffect, useRef, useState } from 'react';
import velaLogo from '../../assets/vela_logo.png';

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [progress, setProgress] = useState(0);

  // 1. Cosmic Space Canvas Animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Generate 120 cosmic stars
    const stars: {
      x: number;
      y: number;
      size: number;
      alpha: number;
      speed: number;
      flickerSpeed: number;
    }[] = [];

    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        size: Math.random() * 1.8 + 0.4,
        alpha: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.3 + 0.05,
        flickerSpeed: Math.random() * 0.02 + 0.005,
      });
    }

    // Shooting star state
    let shootingStar: {
      x: number;
      y: number;
      length: number;
      speed: number;
      dx: number;
      dy: number;
      alpha: number;
      active: boolean;
    } = {
      x: 0,
      y: 0,
      length: 0,
      speed: 0,
      dx: 0,
      dy: 0,
      alpha: 0,
      active: false,
    };

    const triggerShootingStar = () => {
      shootingStar = {
        x: Math.random() * width * 0.7,
        y: Math.random() * height * 0.4,
        length: Math.random() * 90 + 70,
        speed: Math.random() * 10 + 12,
        dx: 1,
        dy: 0.65,
        alpha: 1,
        active: true,
      };
    };

    const shootingStarTimer = setTimeout(() => {
      triggerShootingStar();
    }, 1200);

    // Draw loop
    const render = () => {
      ctx.fillStyle = '#030306';
      ctx.fillRect(0, 0, width, height);

      // Cosmic Radial Nebula Glow
      const cx = width / 2;
      const cy = height / 2;
      const nebula = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.55);
      nebula.addColorStop(0, 'rgba(14, 45, 95, 0.45)');
      nebula.addColorStop(0.35, 'rgba(30, 27, 75, 0.3)');
      nebula.addColorStop(0.7, 'rgba(8, 10, 20, 0.15)');
      nebula.addColorStop(1, 'rgba(3, 3, 6, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, width, height);

      // Render Stars with subtle drift and twinkle
      for (const star of stars) {
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }

        star.alpha += star.flickerSpeed;
        if (star.alpha > 1 || star.alpha < 0.2) {
          star.flickerSpeed = -star.flickerSpeed;
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0.1, star.alpha)})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Render Shooting star
      if (shootingStar.active) {
        ctx.strokeStyle = `rgba(56, 189, 248, ${shootingStar.alpha})`;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(shootingStar.x, shootingStar.y);
        ctx.lineTo(
          shootingStar.x - shootingStar.length * shootingStar.dx,
          shootingStar.y - shootingStar.length * shootingStar.dy
        );
        ctx.stroke();

        shootingStar.x += shootingStar.speed * shootingStar.dx;
        shootingStar.y += shootingStar.speed * shootingStar.dy;
        shootingStar.alpha -= 0.025;

        if (shootingStar.alpha <= 0) {
          shootingStar.active = false;
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(shootingStarTimer);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 2. Timeline & Progress Controller (~3.4 seconds total)
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2.5;
      });
    }, 60);

    // Initiate smooth fade out at 2.8s
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, 2800);

    // Complete transition and unmount at 3.5s
    const exitTimer = setTimeout(() => {
      onComplete();
    }, 3500);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(fadeTimer);
      clearTimeout(exitTimer);
    };
  }, [onComplete]);

  // Click or keydown to skip splash immediately
  const handleQuickSkip = () => {
    setIsFadingOut(true);
    setTimeout(onComplete, 400);
  };

  return (
    <div
      onClick={handleQuickSkip}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none cursor-pointer transition-all duration-700 ease-out ${
        isFadingOut ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Cosmic Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Foreground Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-md">
        {/* Glowing Pulsar Logo Image */}
        <div className="relative mb-6 group">
          <div className="absolute inset-0 rounded-full bg-cyan-500/25 blur-2xl animate-pulse" />
          <img
            src={velaLogo}
            alt="Vela"
            className="w-36 h-36 md:w-44 md:h-44 object-contain rounded-2xl drop-shadow-[0_0_35px_rgba(56,189,248,0.55)] transition-transform duration-1000 ease-out transform hover:scale-105"
          />
        </div>

        {/* Brand Name */}
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-[0.25em] text-white uppercase mb-2 font-mono drop-shadow-[0_2px_12px_rgba(255,255,255,0.35)]">
          V E L A
        </h1>

        {/* Cosmic Pulsar Slogan */}
        <p className="text-xs md:text-sm text-cyan-300 font-medium tracking-wide mb-1">
          Engineered with pulsar-class speed.
        </p>
        <p className="text-[11px] text-zinc-400 font-mono tracking-wider mb-6">
          The Ultra-Lightweight Agent Development Environment
        </p>

        {/* Loading Progress Bar */}
        <div className="w-56 h-1 bg-zinc-800/80 rounded-full overflow-hidden border border-zinc-700/50 backdrop-blur-sm relative">
          <div
            className="h-full bg-gradient-to-r from-sky-400 via-indigo-500 to-purple-500 rounded-full transition-all duration-100 ease-out shadow-[0_0_10px_rgba(56,189,248,0.8)]"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>

        {/* Status Text & Skip Hint */}
        <div className="mt-3 flex items-center justify-between w-56 text-[10px] text-zinc-500 font-mono">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            Initializing core...
          </span>
          <span className="opacity-60 hover:opacity-100 transition-opacity">
            Click to skip
          </span>
        </div>
      </div>
    </div>
  );
};
