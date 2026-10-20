import React from 'react';
import { Terminal, Bot } from 'lucide-react';
import { AgentType } from '../../types';

export interface TerminalIconProps {
  shell?: string;
  title?: string;
  isAgent?: boolean;
  agentType?: AgentType | null;
  className?: string;
}

/**
 * Git Bash icon (official Git orange diamond logo)
 */
export const GitBashIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0`}>
    <path
      fill="#F05032"
      d="M13.09 23.549a1.54 1.54 0 0 1-2.18 0L.451 13.089a1.54 1.54 0 0 1 0-2.179l7.191-7.19 2.733 2.733a1.85 1.85 0 0 0 .964 2.326v6.66a1.849 1.849 0 1 0 1.54 0V8.957l2.508 2.508a1.85 1.85 0 1 0 1.09-1.09l-2.634-2.634a1.85 1.85 0 0 0-2.378-2.377L8.73 2.63 10.91.451a1.54 1.54 0 0 1 2.179 0l10.459 10.46a1.54 1.54 0 0 1 0 2.179z"
    />
  </svg>
);

/**
 * Windows PowerShell icon
 */
export const PowerShellIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0`}>
    <rect width="22" height="18" x="1" y="3" rx="3" fill="#2563EB" />
    <path d="M5.5 7.5L10 12l-4.5 4.5h2.2l4.5-4.5-4.5-4.5H5.5zm6 8h6v1.5h-6z" fill="#FFFFFF" />
  </svg>
);

/**
 * Windows Command Prompt (CMD) icon
 */
export const CmdIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0`}>
    <rect width="22" height="18" x="1" y="3" rx="2.5" fill="#18181B" stroke="#3F3F46" strokeWidth="1.2" />
    <path d="M5 8.5l3.5 3.5L5 15.5h1.8l3.5-3.5L6.8 8.5H5zm5.5 6.5h5.5v1.4h-5.5z" fill="#E4E4E7" />
  </svg>
);

/**
 * WSL / Ubuntu Linux icon
 */
export const WslIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0`}>
    <path
      fill="#E95420"
      d="M17.61.455a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zM12.92.8C8.923.777 5.137 2.941 3.148 6.451a4.5 4.5 0 0 1 .26-.007 4.92 4.92 0 0 1 2.585.737A8.316 8.316 0 0 1 12.688 3.6 4.944 4.944 0 0 1 13.723.834 11.008 11.008 0 0 0 12.92.8zm9.226 4.994a4.915 4.915 0 0 1-1.918 2.246 8.36 8.36 0 0 1-.273 8.303 4.89 4.89 0 0 1 1.632 2.54 11.156 11.156 0 0 0 .559-13.089zM3.41 7.932A3.41 3.41 0 0 0 0 11.342a3.41 3.41 0 0 0 3.41 3.409 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41zm2.027 7.866a4.908 4.908 0 0 1-2.915.358 11.1 11.1 0 0 0 7.991 6.698 11.234 11.234 0 0 0 2.422.249 4.879 4.879 0 0 1-.999-2.85 8.484 8.484 0 0 1-.836-.136 8.304 8.304 0 0 1-5.663-4.32zm11.405.928a3.41 3.41 0 0 0-3.41 3.41 3.41 3.41 0 0 0 3.41 3.41 3.41 3.41 0 0 0 3.41-3.41 3.41 3.41 0 0 0-3.41-3.41z"
    />
  </svg>
);

/**
 * Claude Code CLI icon (official Anthropic Claude sunburst glyph)
 */
export const ClaudeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={`${className} shrink-0`} aria-hidden="true">
    <path
      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      fill="#D97757"
      fillRule="nonzero"
    />
  </svg>
);

let _geminiIconCount = 0;

/**
 * Google Gemini CLI icon (official 4-color Gemini spark)
 */
export const GeminiIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => {
  const [uid] = React.useState(() => `gi-${++_geminiIconCount}`);
  const star =
    'M32.447 0c.68 0 1.273.465 1.439 1.125a38.904 38.904 0 001.999 5.905c2.152 5 5.105 9.376 8.854 13.125 3.751 3.75 8.126 6.703 13.125 8.855a38.98 38.98 0 005.906 1.999c.66.166 1.124.758 1.124 1.438 0 .68-.464 1.273-1.125 1.439a38.902 38.902 0 00-5.905 1.999c-5 2.152-9.375 5.105-13.125 8.854-3.749 3.751-6.702 8.126-8.854 13.125a38.973 38.973 0 00-2 5.906 1.485 1.485 0 01-1.438 1.124c-.68 0-1.272-.464-1.438-1.125a38.913 38.913 0 00-2-5.905c-2.151-5-5.103-9.375-8.854-13.125-3.75-3.749-8.125-6.702-13.125-8.854a38.973 38.973 0 00-5.905-2A1.485 1.485 0 010 32.448c0-.68.465-1.272 1.125-1.438a38.903 38.903 0 005.905-2c5-2.151 9.376-5.104 13.125-8.854 3.75-3.749 6.703-8.125 8.855-13.125a38.972 38.972 0 001.999-5.905A1.485 1.485 0 0132.447 0z';

  return (
    <svg
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 65 65"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      <mask
        id={`${uid}-mask`}
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="65"
        height="65"
      >
        <path d={star} fill="#000" />
      </mask>
      <g mask={`url(#${uid}-mask)`}>
        <g filter={`url(#${uid}-f0)`}>
          <path
            d="M-5.859 50.734c7.498 2.663 16.116-2.33 19.249-11.152 3.133-8.821-.406-18.131-7.904-20.794-7.498-2.663-16.116 2.33-19.25 11.151-3.132 8.822.407 18.132 7.905 20.795z"
            fill="#FFE432"
          />
        </g>
        <g filter={`url(#${uid}-f1)`}>
          <path
            d="M27.433 21.649c10.3 0 18.651-8.535 18.651-19.062 0-10.528-8.35-19.062-18.651-19.062S8.78-7.94 8.78 2.587c0 10.527 8.35 19.062 18.652 19.062z"
            fill="#FC413D"
          />
        </g>
        <g filter={`url(#${uid}-f2)`}>
          <path
            d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f3)`}>
          <path
            d="M20.184 82.608c10.753-.525 18.918-12.244 18.237-26.174-.68-13.93-9.95-24.797-20.703-24.271C6.965 32.689-1.2 44.407-.519 58.337c.681 13.93 9.95 24.797 20.703 24.271z"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f4)`}>
          <path
            d="M30.954 74.181c9.014-5.485 11.427-17.976 5.389-27.9-6.038-9.925-18.241-13.524-27.256-8.04-9.015 5.486-11.428 17.977-5.39 27.902 6.04 9.924 18.242 13.523 27.257 8.038z"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f5)`}>
          <path
            d="M67.391 42.993c10.132 0 18.346-7.91 18.346-17.666 0-9.757-8.214-17.667-18.346-17.667s-18.346 7.91-18.346 17.667c0 9.757 8.214 17.666 18.346 17.666z"
            fill="#3186FF"
          />
        </g>
        <g filter={`url(#${uid}-f6)`}>
          <path
            d="M-13.065 40.944c9.33 7.094 22.959 4.869 30.442-4.972 7.483-9.84 5.987-23.569-3.343-30.663C4.704-1.786-8.924.439-16.408 10.28c-7.483 9.84-5.986 23.57 3.343 30.664z"
            fill="#FBBC04"
          />
        </g>
        <g filter={`url(#${uid}-f7)`}>
          <path
            d="M34.74 51.43c11.135 7.656 25.896 5.524 32.968-4.764 7.073-10.287 3.779-24.832-7.357-32.488C49.215 6.52 34.455 8.654 27.382 18.94c-7.072 10.288-3.779 24.833 7.357 32.49z"
            fill="#3186FF"
          />
        </g>
        <g filter={`url(#${uid}-f8)`}>
          <path
            d="M54.984-2.336c2.833 3.852-.808 11.34-8.131 16.727-7.324 5.387-15.557 6.631-18.39 2.78-2.833-3.853.807-11.342 8.13-16.728 7.324-5.387 15.558-6.631 18.39-2.78z"
            fill="#749BFF"
          />
        </g>
        <g filter={`url(#${uid}-f9)`}>
          <path
            d="M31.727 16.104C43.053 5.598 46.94-8.626 40.41-15.666c-6.53-7.04-21.006-4.232-32.332 6.274s-15.214 24.73-8.683 31.77c6.53 7.04 21.006 4.232 32.332-6.274z"
            fill="#FC413D"
          />
        </g>
        <g filter={`url(#${uid}-f10)`}>
          <path
            d="M8.51 53.838c6.732 4.818 14.46 5.55 17.262 1.636 2.802-3.915-.384-10.994-7.116-15.812-6.731-4.818-14.46-5.55-17.261-1.636-2.802 3.915.383 10.994 7.115 15.812z"
            fill="#FFEE48"
          />
        </g>
      </g>
      <defs>
        <filter
          id={`${uid}-f0`}
          x="-19.824"
          y="13.152"
          width="39.274"
          height="43.217"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="2.46" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f1`}
          x="-15.001"
          y="-40.257"
          width="84.868"
          height="85.688"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="11.891" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f2`}
          x="-20.776"
          y="11.927"
          width="79.454"
          height="90.916"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f3`}
          x="-20.776"
          y="11.927"
          width="79.454"
          height="90.916"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f4`}
          x="-19.845"
          y="15.459"
          width="79.731"
          height="81.505"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="10.109" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f5`}
          x="29.832"
          y="-11.552"
          width="75.117"
          height="73.758"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="9.606" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f6`}
          x="-38.583"
          y="-16.253"
          width="78.135"
          height="78.758"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="8.706" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f7`}
          x="8.107"
          y="-5.966"
          width="78.877"
          height="77.539"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="7.775" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f8`}
          x="13.587"
          y="-18.488"
          width="56.272"
          height="51.81"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="6.957" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f9`}
          x="-15.526"
          y="-31.297"
          width="70.856"
          height="69.306"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="5.876" result="effect1_foregroundBlur" />
        </filter>
        <filter
          id={`${uid}-f10`}
          x="-14.168"
          y="20.964"
          width="55.501"
          height="51.571"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur stdDeviation="7.273" result="effect1_foregroundBlur" />
        </filter>
      </defs>
    </svg>
  );
};

/**
 * OpenAI Codex CLI icon (official OpenAI blossom glyph)
 */
export const CodexIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
  </svg>
);

/**
 * Aider AI icon (official green terminal-prompt mark)
 */
export const AiderIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <rect x="2" y="2" width="20" height="20" rx="4" fill="#072807" stroke="#14b014" strokeWidth="1.5" />
    <path d="M6.5 8.5L11 12L6.5 15.5" stroke="#14b014" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12.5 16H17.5" stroke="#14b014" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

/**
 * OpenCode CLI icon (official brand identity mark)
 */
export const OpenCodeIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 240 300"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <path d="M180 240H60V120H180V240Z" fill="#4B4646" />
    <path fillRule="evenodd" clipRule="evenodd" d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" fill="#F1ECEC" />
  </svg>
);

/**
 * Factory Droid CLI icon (official Factory.ai pinwheel glyph)
 */
export const DroidIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => (
  <svg
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${className} shrink-0`}
    aria-hidden="true"
  >
    <rect width="20" height="20" rx="4" fill="#000000" />
    <g transform="translate(0.4 0.75)">
      <path
        fill="#FFFFFF"
        d="M13.9062 3.20484C13.8706 3.19623 13.8373 3.18019 13.8086 3.15788C13.7799 3.13552 13.7565 3.10743 13.74 3.07546C13.7234 3.04349 13.7142 3.00841 13.7128 2.97263C13.7115 2.93682 13.7181 2.90121 13.7322 2.86815C14.2188 1.71337 14.4334 0.789376 14.087 0.402562C13.1693 -0.623688 9.48933 1.41705 8.31598 2.10822C8.28457 2.12665 8.24942 2.13825 8.21299 2.14222C8.17656 2.14618 8.13967 2.14242 8.10486 2.13122C8.07004 2.12003 8.03809 2.10163 8.01123 2.0773C7.98437 2.05297 7.96323 2.02326 7.94918 1.99024C7.45597 0.83788 6.93748 0.036362 6.41194 0.00160127C5.01894 -0.0913635 3.89616 3.88951 3.56749 5.18697C3.5587 5.22173 3.54233 5.25423 3.5195 5.2822C3.49662 5.31021 3.46781 5.33305 3.43507 5.34918C3.40233 5.3653 3.36639 5.37432 3.32971 5.37561C3.29307 5.37694 3.25656 5.37052 3.22266 5.35677C2.03854 4.88225 1.09066 4.67288 0.694439 5.01078C-0.35788 5.90567 1.73432 9.49452 2.44305 10.6388C2.462 10.6694 2.47393 10.7037 2.47804 10.7392C2.48214 10.7748 2.47833 10.8108 2.46684 10.8447C2.45536 10.8787 2.43646 10.9099 2.41147 10.9361C2.38648 10.9623 2.35598 10.9828 2.32203 10.9965C1.14081 11.4775 0.318936 11.9831 0.282878 12.4956C0.187966 13.8541 4.26959 14.9491 5.60043 15.2696C5.63599 15.2783 5.66919 15.2943 5.69783 15.3167C5.72642 15.339 5.7498 15.3671 5.76625 15.399C5.78275 15.4309 5.79199 15.4659 5.79332 15.5016C5.79469 15.5373 5.78814 15.5729 5.77409 15.6059C5.28751 16.7607 5.07282 17.6851 5.41931 18.0715C6.33693 19.0977 10.0173 17.0574 11.1907 16.3662C11.2221 16.3477 11.2573 16.3361 11.2937 16.3321C11.3302 16.3281 11.3671 16.3318 11.4019 16.343C11.4368 16.3542 11.4687 16.3727 11.4955 16.397C11.5224 16.4214 11.5435 16.4511 11.5575 16.4842C12.0507 17.6362 12.5688 18.4377 13.0947 18.4729C14.4877 18.5654 15.6105 14.5849 15.9388 13.2871C15.9476 13.2524 15.9641 13.2199 15.987 13.192C16.0099 13.164 16.0388 13.1412 16.0716 13.1251C16.1043 13.1091 16.1403 13.1001 16.177 13.0988C16.2136 13.0975 16.2502 13.1039 16.284 13.1177C17.4681 13.5922 18.4156 13.8012 18.8122 13.4637C19.8646 12.5688 17.7719 8.97953 17.0632 7.83525C17.0444 7.80462 17.0326 7.77034 17.0286 7.73485C17.0245 7.69932 17.0284 7.66335 17.0399 7.62944C17.0514 7.59549 17.0702 7.56436 17.0951 7.53817C17.12 7.51198 17.1504 7.49129 17.1842 7.47758C18.3659 6.99659 19.1877 6.4909 19.2234 5.97838C19.3187 4.61989 15.2367 3.52497 13.9062 3.20484ZM12.3081 1.90249C12.5758 2.37055 11.1961 5.48935 10.1699 7.67079C10.1527 7.70725 10.1245 7.73772 10.0891 7.75809C10.0536 7.77847 10.0126 7.78776 9.97155 7.78473C9.93052 7.7817 9.8914 7.76646 9.85952 7.74112C9.82761 7.71573 9.80444 7.68146 9.79313 7.64286C9.37866 6.22454 8.90493 4.55809 8.39805 3.14341C8.37815 3.08787 8.37915 3.02724 8.40087 2.97239C8.42258 2.9175 8.46361 2.87195 8.51658 2.84386C9.78235 2.16966 11.9483 1.27437 12.3081 1.90249ZM6.24201 2.28849C6.77045 2.43481 8.05612 5.59161 8.91198 7.84176C8.92628 7.87935 8.92839 7.9203 8.91811 7.95914C8.90779 7.99794 8.88558 8.03274 8.85441 8.0589C8.8232 8.08505 8.78457 8.10126 8.74367 8.10534C8.70276 8.10946 8.66156 8.10126 8.62559 8.08185C7.30304 7.36603 5.76082 6.51318 4.37652 5.86242C4.32231 5.83676 4.27921 5.79322 4.25483 5.73947C4.23046 5.68575 4.22644 5.62532 4.24348 5.56898C4.65089 4.22058 5.53204 2.09246 6.24201 2.28849ZM2.23251 6.74474C2.71204 6.48363 5.91044 7.82923 8.14688 8.83002C8.18431 8.84675 8.21556 8.87424 8.23645 8.90884C8.25734 8.94339 8.26687 8.98341 8.26376 9.02343C8.26061 9.06344 8.24503 9.10156 8.219 9.13268C8.19301 9.16376 8.15787 9.1864 8.11828 9.19743C6.66435 9.60162 4.95511 10.0636 3.50449 10.558C3.44763 10.5772 3.38554 10.5762 3.32938 10.555C3.27322 10.5339 3.22655 10.4939 3.19779 10.4423C2.50771 9.2079 1.58802 7.09558 2.23251 6.74474ZM2.62832 12.6606C2.77794 12.1452 6.0153 10.8914 8.32261 10.0567C8.36116 10.0428 8.40319 10.0407 8.44297 10.0508C8.4828 10.0608 8.51849 10.0825 8.5453 10.1129C8.57208 10.1433 8.58874 10.181 8.59293 10.2209C8.59711 10.2607 8.5887 10.3009 8.56881 10.336C7.83438 11.6258 6.95986 13.1298 6.29258 14.4794C6.26651 14.5325 6.22187 14.5747 6.16671 14.5986C6.11158 14.6224 6.04954 14.6263 5.99168 14.6096C4.60903 14.2147 2.42689 13.353 2.62832 12.6606ZM7.19776 16.5707C6.92961 16.1031 8.30977 12.9839 9.33597 10.8029C9.35313 10.7664 9.38136 10.7359 9.41679 10.7155C9.45227 10.6952 9.49326 10.6859 9.53429 10.6889C9.57537 10.6919 9.61445 10.7072 9.64632 10.7325C9.67824 10.7579 9.7014 10.7922 9.71272 10.8308C10.1272 12.2487 10.6009 13.9156 11.1078 15.3303C11.1276 15.3858 11.1265 15.4463 11.1047 15.5011C11.0829 15.5559 11.0418 15.6014 10.9888 15.6294C9.7235 16.3023 7.5571 17.1993 7.19901 16.5707H7.19776ZM13.2638 16.1847C12.735 16.0388 11.4493 12.8817 10.5935 10.6315C10.5791 10.5938 10.5769 10.5528 10.5872 10.5139C10.5975 10.475 10.6198 10.4401 10.6511 10.414C10.6823 10.3878 10.7211 10.3716 10.762 10.3676C10.803 10.3635 10.8443 10.3719 10.8803 10.3914C12.2024 11.1072 13.745 11.9605 15.1289 12.6113C15.1832 12.6368 15.2264 12.6803 15.2508 12.7341C15.2752 12.7878 15.2792 12.8483 15.262 12.9047C14.855 14.2551 13.9738 16.3811 13.2638 16.1847ZM17.2733 11.7285C16.7934 11.99 13.5954 10.644 11.3586 9.64322C11.3211 9.62648 11.2899 9.599 11.269 9.5644C11.2481 9.52984 11.2386 9.48983 11.2417 9.44981C11.2448 9.40979 11.2604 9.37168 11.2864 9.34056C11.3124 9.30947 11.3476 9.28688 11.3871 9.27584C12.8415 8.87165 14.5503 8.40962 16.0009 7.91529C16.0579 7.89601 16.1201 7.89706 16.1763 7.91832C16.2326 7.93958 16.2793 7.97963 16.3081 8.03133C16.9977 9.26534 17.9174 11.378 17.2733 11.7285ZM16.8775 5.81266C16.7275 6.32842 13.4905 7.58227 11.1832 8.41693C11.1446 8.43092 11.1025 8.43302 11.0627 8.42299C11.0228 8.41293 10.987 8.39122 10.9602 8.36075C10.9334 8.33027 10.9168 8.29248 10.9126 8.2525C10.9085 8.21257 10.917 8.17231 10.937 8.13719C11.6711 6.84781 12.5456 5.3434 13.2129 3.99379C13.2391 3.94088 13.2837 3.8988 13.3389 3.87504C13.394 3.85127 13.456 3.84735 13.5138 3.86404C14.8964 4.26096 17.0785 5.12028 16.8775 5.81266Z"
      />
    </g>
  </svg>
);

let _antigravityIconCount = 0;

/**
 * Google Antigravity CLI (agy) icon
 */
export const AntigravityIcon: React.FC<{ className?: string }> = ({ className = 'w-3.5 h-3.5' }) => {
  const [uid] = React.useState(() => `ag-${++_antigravityIconCount}`);
  const archPath =
    'M144.248 149.062C151.748 154.688 162.998 150.938 152.685 140.625C121.748 110.625 128.31 28.125 89.8727 28.125C51.4352 28.125 57.9977 110.625 27.0602 140.625C15.8102 151.875 27.9977 154.688 35.4977 149.062C64.5602 129.375 62.6852 94.6875 89.8727 94.6875C117.06 94.6875 115.185 129.375 144.248 149.062Z';

  return (
    <svg
      viewBox="16 20 148 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      <path d={archPath} fill="#3186FF" />
      <mask
        id={`${uid}-m`}
        style={{ maskType: 'alpha' }}
        maskUnits="userSpaceOnUse"
        x="22"
        y="28"
        width="136"
        height="125"
      >
        <path d={archPath} fill="white" />
      </mask>
      <g mask={`url(#${uid}-m)`}>
        <g filter={`url(#${uid}-f0)`}>
          <ellipse
            cx="36.6225"
            cy="43.0872"
            rx="36.6225"
            ry="43.0872"
            transform="matrix(-0.112784 0.99362 -0.99362 -0.112781 106.557 -26.4847)"
            fill="#FFE432"
          />
        </g>
        <g filter={`url(#${uid}-f1)`}>
          <ellipse
            cx="155.163"
            cy="54.9292"
            rx="47.4118"
            ry="48.4541"
            transform="rotate(76.9243 155.163 54.9292)"
            fill="#FC413D"
          />
        </g>
        <g filter={`url(#${uid}-f2)`}>
          <ellipse
            cx="14.6006"
            cy="65.4425"
            rx="49.5515"
            ry="64.192"
            transform="rotate(74.1257 14.6006 65.4425)"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f3)`}>
          <ellipse
            cx="14.6006"
            cy="65.4425"
            rx="49.5515"
            ry="64.192"
            transform="rotate(74.1257 14.6006 65.4425)"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f4)`}>
          <ellipse
            cx="18.1226"
            cy="67.414"
            rx="48.5679"
            ry="53.4688"
            transform="rotate(45.6065 18.1226 67.414)"
            fill="#00B95C"
          />
        </g>
        <g filter={`url(#${uid}-f5)`}>
          <ellipse
            cx="121.837"
            cy="166.945"
            rx="46.6356"
            ry="44.9084"
            transform="rotate(76.9243 121.837 166.945)"
            fill="#3186FF"
          />
        </g>
        <g filter={`url(#${uid}-f6)`}>
          <ellipse
            cx="53.9456"
            cy="56.8997"
            rx="53.9456"
            ry="56.8997"
            transform="matrix(-0.409539 0.912293 -0.912294 -0.409537 162.811 -25.895)"
            fill="#FBBC04"
          />
        </g>
        <g filter={`url(#${uid}-f7)`}>
          <path
            d="M4.21557 239.063C-25.3231 227.467 25.1577 132.061 37.7105 100.085C50.2634 68.1097 84.3853 51.5888 113.924 63.1848C143.463 74.7809 178.474 138.65 165.921 170.626C153.368 202.601 33.7543 250.659 4.21557 239.063Z"
            fill="#3186FF"
          />
        </g>
        <g filter={`url(#${uid}-f8)`}>
          <path
            d="M183.197 120.315C175.289 129.545 154.652 124.839 137.102 109.803C119.553 94.7668 111.738 75.0955 119.646 65.8656C127.554 56.6357 148.191 61.3423 165.74 76.3782C183.289 91.414 191.105 111.085 183.197 120.315Z"
            fill="#749BFF"
          />
        </g>
        <g filter={`url(#${uid}-f9)`}>
          <ellipse
            cx="148.928"
            cy="36.7252"
            rx="71.1018"
            ry="44.199"
            transform="rotate(34.0763 148.928 36.7252)"
            fill="#FC413D"
          />
        </g>
        <g filter={`url(#${uid}-f10)`}>
          <ellipse
            cx="37.848"
            cy="46.0346"
            rx="38.1008"
            ry="22.1575"
            transform="rotate(112.516 37.848 46.0346)"
            fill="#FFEE48"
          />
        </g>
      </g>
      <defs>
        <filter
          id={`${uid}-f0`}
          x="4.09591"
          y="-44.1761"
          width="111.037"
          height="98.4416"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="6.25234" />
        </filter>
        <filter
          id={`${uid}-f1`}
          x="46.2974"
          y="-53.0009"
          width="217.731"
          height="215.86"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="30.2268" />
        </filter>
        <filter
          id={`${uid}-f2`}
          x="-100.018"
          y="-36.7558"
          width="229.238"
          height="204.397"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id={`${uid}-f3`}
          x="-100.018"
          y="-36.7558"
          width="229.238"
          height="204.397"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id={`${uid}-f4`}
          x="-84.3985"
          y="-35.003"
          width="205.042"
          height="204.834"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="25.6957" />
        </filter>
        <filter
          id={`${uid}-f5`}
          x="27.9915"
          y="71.5493"
          width="187.691"
          height="190.791"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="24.4184" />
        </filter>
        <filter
          id={`${uid}-f6`}
          x="-11.8808"
          y="-98.7085"
          width="201.38"
          height="197.45"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="22.1301" />
        </filter>
        <filter
          id={`${uid}-f7`}
          x="-44.4432"
          y="19.9522"
          width="252.513"
          height="260.404"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="19.7631" />
        </filter>
        <filter
          id={`${uid}-f8`}
          x="81.1915"
          y="25.7722"
          width="140.46"
          height="134.637"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="17.6843" />
        </filter>
        <filter
          id={`${uid}-f9`}
          x="55.1499"
          y="-47.2531"
          width="187.555"
          height="167.957"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="14.9365" />
        </filter>
        <filter
          id={`${uid}-f10`}
          x="-24.2633"
          y="-27.1515"
          width="124.223"
          height="146.372"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="18.4865" />
        </filter>
      </defs>
    </svg>
  );
};

export type TerminalType =
  | 'git-bash'
  | 'powershell'
  | 'cmd'
  | 'wsl'
  | 'claude'
  | 'gemini'
  | 'aider'
  | 'codex'
  | 'opencode'
  | 'droid'
  | 'antigravity'
  | 'agent'
  | 'terminal';

const AGENT_TYPES: Record<string, TerminalType> = {
  claude_code: 'claude',
  gemini_cli: 'gemini',
  aider: 'aider',
  codex: 'codex',
  open_code: 'opencode',
  droid_cli: 'droid',
  antigravity: 'antigravity',
};

/** Match whole words only, so a folder like "android" or "strategy" is not Droid or agy. */
function agentFromName(name: string): TerminalType | null {
  const words = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const has = (word: string) => words.includes(word);
  if (has('claude')) return 'claude';
  if (has('gemini')) return 'gemini';
  if (has('aider')) return 'aider';
  if (has('codex')) return 'codex';
  if (has('opencode') || words.join(' ').includes('open code')) return 'opencode';
  if (has('droid')) return 'droid';
  if (has('antigravity') || has('agy')) return 'antigravity';
  return null;
}

function shellFromName(name: string): TerminalType | null {
  const lower = name.toLowerCase();
  const words = lower.split(/[^a-z0-9]+/).filter(Boolean);
  if (words.includes('bash') || lower.includes('git-bash') || lower.includes('git bash')) return 'git-bash';
  if (words.includes('powershell') || words.includes('pwsh')) return 'powershell';
  if (words.includes('cmd') || lower.includes('command prompt')) return 'cmd';
  if (words.includes('wsl') || lower.includes('ubuntu')) return 'wsl';
  return null;
}

/**
 * Helper to identify shell/agent type.
 * The session's agent type and executable are authoritative. The title is only a
 * fallback, and only its name part: formatTabTitle appends "(branch-or-folder)",
 * which must not pick the icon.
 */
export function detectTerminalType(params: {
  shell?: string;
  title?: string;
  isAgent?: boolean;
  agentType?: AgentType | null;
}): TerminalType {
  const agentType = params.agentType;
  if (typeof agentType === 'string' && AGENT_TYPES[agentType]) return AGENT_TYPES[agentType];

  const executable = (params.shell || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .replace(/\.exe$/i, '');
  const name = (params.title || '').split(' (')[0];

  const agent = agentFromName(executable);
  if (agent) return agent;

  if (params.isAgent || agentType) {
    const custom = typeof agentType === 'object' && agentType ? agentFromName(agentType.custom) : null;
    return custom || agentFromName(name) || 'agent';
  }

  return shellFromName(executable) || agentFromName(name) || shellFromName(name) || 'terminal';
}

/**
 * Universal terminal icon component for tabs, dropdowns, and launch selectors
 */
export const TerminalIcon: React.FC<TerminalIconProps> = ({
  shell,
  title,
  isAgent,
  agentType,
  className = 'w-3.5 h-3.5',
}) => {
  const type = detectTerminalType({ shell, title, isAgent, agentType });

  switch (type) {
    case 'git-bash':
      return <GitBashIcon className={className} />;
    case 'powershell':
      return <PowerShellIcon className={className} />;
    case 'cmd':
      return <CmdIcon className={className} />;
    case 'wsl':
      return <WslIcon className={className} />;
    case 'claude':
      return <ClaudeIcon className={className} />;
    case 'gemini':
      return <GeminiIcon className={className} />;
    case 'aider':
      return <AiderIcon className={className} />;
    case 'codex':
      return <CodexIcon className={className} />;
    case 'opencode':
      return <OpenCodeIcon className={className} />;
    case 'droid':
      return <DroidIcon className={className} />;
    case 'antigravity':
      return <AntigravityIcon className={className} />;
    case 'agent':
      return <Bot className={`${className} text-orca-emerald shrink-0`} />;
    case 'terminal':
    default:
      return <Terminal className={`${className} text-orca-muted shrink-0`} />;
  }
};
