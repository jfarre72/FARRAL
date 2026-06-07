"use client";
import { Box, Stack, Typography } from "@mui/material";

/**
 * Donut chart liviano en SVG (sin dependencias externas).
 * props:
 *  - segments: [{ label, value, color }]
 *  - size, thickness
 *  - centerLabel, centerValue
 */
export default function DonutChart({
  segments = [],
  size = 180,
  thickness = 26,
  centerLabel,
  centerValue,
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  const radius = (size - thickness) / 2;
  const circ = 2 * Math.PI * radius;
  const cx = size / 2;
  const cy = size / 2;

  let offset = 0;
  const arcs = total > 0
    ? segments.map((seg) => {
        const frac = Math.max(0, Number(seg.value) || 0) / total;
        const dash = frac * circ;
        const el = (
          <circle
            key={seg.label}
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })
    : null;

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={3} alignItems="center">
      <Box sx={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size}>
          <circle
            cx={cx} cy={cy} r={radius}
            fill="none"
            stroke="rgba(15,42,74,0.08)"
            strokeWidth={thickness}
          />
          {arcs}
        </svg>
        <Box sx={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
        }}>
          {centerValue !== undefined && (
            <Typography variant="h5" fontWeight={700}>{centerValue}</Typography>
          )}
          {centerLabel && (
            <Typography variant="caption" color="text.secondary">{centerLabel}</Typography>
          )}
        </Box>
      </Box>

      <Stack spacing={0.75}>
        {segments.map((seg) => (
          <Stack key={seg.label} direction="row" spacing={1} alignItems="center">
            <Box sx={{ width: 12, height: 12, borderRadius: "3px", bgcolor: seg.color }} />
            <Typography variant="body2" sx={{ minWidth: 130 }}>{seg.label}</Typography>
            <Typography variant="body2" fontWeight={600}>
              {total > 0 ? `${((Math.max(0, seg.value) / total) * 100).toFixed(1)}%` : "—"}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
