import React from 'react';

interface ThieThieLogoProps {
  variant?: 'icon' | 'full' | 'favicon';
  size?: number | string;
  className?: string;
  animated?: boolean;
}

export const ThieThieLogo: React.FC<ThieThieLogoProps> = ({
  variant = 'icon',
  size = 40,
  className = '',
  animated = false,
}) => {
  // Dimensions and styling based on props
  const dimensions = typeof size === 'number' ? `${size}px` : size;

  return (
    <svg
      width={dimensions}
      height={dimensions}
      viewBox={variant === 'full' ? "0 0 600 500" : "0 0 400 400"}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} select-none overflow-visible`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="logo-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <filter id="subtle-glow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        {/* Gradients */}
        <linearGradient id="silver-t-grad" x1="200" y1="100" x2="200" y2="350" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#ECEFF1" />
          <stop offset="100%" stopColor="#CFD8DC" />
        </linearGradient>

        <linearGradient id="purple-wing-left" x1="70" y1="130" x2="200" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D8B4FE" />
          <stop offset="50%" stopColor="#9333EA" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>

        <linearGradient id="purple-wing-right" x1="330" y1="130" x2="200" y2="300" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D8B4FE" />
          <stop offset="50%" stopColor="#9333EA" />
          <stop offset="100%" stopColor="#4C1D95" />
        </linearGradient>

        <linearGradient id="bright-violet-accent" x1="100" y1="150" x2="300" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F472B6" />
          <stop offset="50%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#6366F1" />
        </linearGradient>

        {/* Text Gradient */}
        <linearGradient id="text-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#E9D5FF" />
          <stop offset="100%" stopColor="#C084FC" />
        </linearGradient>
      </defs>

      {/* Main Logo Emblem (Centered in a 400x400 space) */}
      <g 
        transform={variant === 'full' ? "translate(100, 30)" : "translate(0, 0)"}
        className={animated ? "animate-pulse" : ""}
      >
        {/* Ambient Purple backing glow */}
        <path
          d="M 200 65 L 350 145 L 290 280 L 200 375 L 110 280 L 50 145 Z"
          fill="#7C3AED"
          opacity="0.12"
          filter="url(#logo-glow)"
        />

        {/* =========================================================
            WING PARTS - LEFT SIDE (Geometric layered feathers)
           ========================================================= */}
        
        {/* Base dark shadow wing */}
        <path
          d="M 190 120 L 55 155 L 125 240 L 190 185 Z"
          fill="#311042"
        />

        {/* Main outer sweeping wing feather */}
        <path
          d="M 190 120 L 40 150 L 135 255 L 175 220 Z"
          fill="url(#purple-wing-left)"
        />

        {/* Mid wing panel/accent */}
        <path
          d="M 185 145 L 80 180 L 140 260 L 180 200 Z"
          fill="url(#bright-violet-accent)"
          opacity="0.85"
        />

        {/* Inner wing facet */}
        <path
          d="M 190 170 L 110 215 L 150 270 L 195 210 Z"
          fill="#4A0E4E"
        />

        {/* Lower sweeping wing feather (tail feather) */}
        <path
          d="M 195 210 L 125 275 L 175 325 L 200 275 Z"
          fill="url(#purple-wing-left)"
        />

        {/* Sharp bottom-most trim */}
        <path
          d="M 198 250 L 150 310 L 185 345 L 200 310 Z"
          fill="#8A5CF5"
          opacity="0.9"
        />

        {/* =========================================================
            WING PARTS - RIGHT SIDE (Geometric layered feathers)
           ========================================================= */}

        {/* Base dark shadow wing */}
        <path
          d="M 210 120 L 345 155 L 275 240 L 210 185 Z"
          fill="#311042"
        />

        {/* Main outer sweeping wing feather */}
        <path
          d="M 210 120 L 360 150 L 265 255 L 225 220 Z"
          fill="url(#purple-wing-right)"
        />

        {/* Mid wing panel/accent */}
        <path
          d="M 215 145 L 320 180 L 260 260 L 220 200 Z"
          fill="url(#bright-violet-accent)"
          opacity="0.85"
        />

        {/* Inner wing facet */}
        <path
          d="M 210 170 L 290 215 L 250 270 L 205 210 Z"
          fill="#4A0E4E"
        />

        {/* Lower sweeping wing feather (tail feather) */}
        <path
          d="M 205 210 L 275 275 L 225 325 L 200 275 Z"
          fill="url(#purple-wing-right)"
        />

        {/* Sharp bottom-most trim */}
        <path
          d="M 202 250 L 250 310 L 215 345 L 200 310 Z"
          fill="#8A5CF5"
          opacity="0.9"
        />

        {/* =========================================================
            CENTRAL T-SHIELD / DAGGER (White-silver centerpiece)
           ========================================================= */}

        {/* T-shape Outward Shadow/Border */}
        <path
          d="M 103 107 L 297 107 L 262 165 L 227 165 L 210 330 L 200 380 L 190 330 L 173 165 L 138 165 Z"
          fill="#1A0B2E"
          opacity="0.5"
          filter="url(#subtle-glow)"
        />

        {/* Main T-shape body */}
        {/* Top bar of the T, with angled cuts on left and right, and sleek tapered pillar stem ending in a sharp tip */}
        <path
          d="M 110 110 L 290 110 L 255 160 L 222 160 L 206 310 L 200 370 L 194 310 L 178 160 L 145 160 Z"
          fill="url(#silver-t-grad)"
        />

        {/* Metallic 3D facet cut (Left side of T is shaded darker silver to give 3D depth) */}
        <path
          d="M 200 110 L 110 110 L 145 160 L 178 160 L 194 310 L 200 370 Z"
          fill="#000000"
          opacity="0.08"
        />

        {/* Bright central vertical highlight beam */}
        <line
          x1="200"
          y1="110"
          x2="200"
          y2="368"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Top bar detail line */}
        <path
          d="M 125 118 L 275 118"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </g>

      {/* =========================================================
          FULL LOGO TEXT (Underneath for variant="full")
         ========================================================= */}
      {variant === 'full' && (
        <g transform="translate(0, 410)">
          {/* Main Brand Text: THIE THIE */}
          <text
            x="300"
            y="0"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="900"
            fontSize="44"
            fontStyle="italic"
            letterSpacing="8"
            fill="url(#text-grad)"
            stroke="#9333EA"
            strokeWidth="1"
            style={{ textTransform: 'uppercase' }}
          >
            Thie Thie
          </text>

          {/* Subtext: SERVICES */}
          <text
            x="300"
            y="35"
            textAnchor="middle"
            fontFamily="system-ui, -apple-system, sans-serif"
            fontWeight="700"
            fontSize="18"
            letterSpacing="12"
            fill="#C084FC"
            style={{ textTransform: 'uppercase' }}
          >
            Services
          </text>

          {/* Underline Accents */}
          <path
            d="M 120 55 L 480 55"
            stroke="url(#bright-violet-accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <circle cx="300" cy="55" r="4.5" fill="#F472B6" />
        </g>
      )}
    </svg>
  );
};
