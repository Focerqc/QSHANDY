import React from "react";

const HandyTextLogo = ({
  width,
  height,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) => {
  return (
    <svg
      width={width}
      height={height}
      className={className}
      viewBox="0 0 930 328"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer outline / bubble stroke */}
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="logo-stroke select-none"
        style={{
          fontFamily:
            "ui-rounded, 'Comfortaa', 'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif",
          fontSize: "185px",
          fontWeight: 900,
          letterSpacing: "4px",
          strokeWidth: "26px",
          strokeLinejoin: "round",
          strokeLinecap: "round",
        }}
      >
        QSHANDY
      </text>

      {/* Primary bubble fill */}
      <text
        x="50%"
        y="58%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="logo-primary select-none"
        style={{
          fontFamily:
            "ui-rounded, 'Comfortaa', 'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif",
          fontSize: "185px",
          fontWeight: 900,
          letterSpacing: "4px",
        }}
      >
        QSHANDY
      </text>

      {/* Soft highlight on upper half */}
      <text
        x="49.5%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#F9C5E8"
        className="select-none"
        style={{
          fontFamily:
            "ui-rounded, 'Comfortaa', 'Fredoka', 'Nunito', 'Arial Rounded MT Bold', sans-serif",
          fontSize: "178px",
          fontWeight: 900,
          letterSpacing: "4px",
          opacity: 0.45,
        }}
      >
        QSHANDY
      </text>
    </svg>
  );
};

export default HandyTextLogo;
