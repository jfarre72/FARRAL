"use client";
import { createTheme, alpha } from "@mui/material/styles";

const NAVY    = "#0F2A4A";
const NAVY_2  = "#1B3A66";
const ORANGE  = "#E07A1F";
const ORANGE_2= "#F08A2A";
const BG      = "#F4F6FA";
const PAPER   = "#FFFFFF";
const TEXT    = "#0E1726";
const TEXT_2  = "#5B6573";
const BORDER  = "rgba(15,42,74,0.10)";

const theme = createTheme({
  palette: {
    mode: "light",
    primary:   { main: NAVY,   dark: "#0a1d36", light: NAVY_2,  contrastText: "#fff" },
    secondary: { main: ORANGE, dark: "#b8611a", light: ORANGE_2, contrastText: "#fff" },
    background: { default: BG, paper: PAPER },
    success: { main: "#1E8E3E" },
    warning: { main: "#E0A21F" },
    error:   { main: "#C0392B" },
    text:    { primary: TEXT, secondary: TEXT_2 },
    divider: BORDER,
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Inter","Roboto","Helvetica","Arial",sans-serif',
    h4: { fontWeight: 700, letterSpacing: -0.4 },
    h5: { fontWeight: 700, letterSpacing: -0.3 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, color: TEXT_2 },
    body2: { color: TEXT_2 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: NAVY,
          color: "#fff",
          boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
          backgroundImage: `linear-gradient(180deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: `1px solid ${BORDER}`,
          backgroundColor: PAPER,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          boxShadow:
            "0 1px 2px rgba(15,42,74,0.04), 0 8px 24px rgba(15,42,74,0.06)",
          border: `1px solid ${BORDER}`,
        },
      },
    },
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: "none" } },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 10,
          paddingTop: 8,
          paddingBottom: 8,
          paddingLeft: 16,
          paddingRight: 16,
        },
        sizeSmall: { paddingTop: 6, paddingBottom: 6 },
        containedPrimary: {
          boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
          "&:hover": { backgroundColor: "#0a1d36" },
        },
        containedSecondary: {
          backgroundImage: `linear-gradient(180deg, ${ORANGE_2} 0%, ${ORANGE} 100%)`,
          boxShadow: "0 1px 0 rgba(0,0,0,0.08)",
          "&:hover": {
            backgroundImage: `linear-gradient(180deg, ${ORANGE} 0%, #c46514 100%)`,
          },
        },
        outlined: { borderWidth: 1.5, "&:hover": { borderWidth: 1.5 } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 },
        outlined: { borderWidth: 1.5 },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 10,
          paddingTop: 6,
          paddingBottom: 6,
          paddingLeft: 14,
          paddingRight: 14,
          borderColor: BORDER,
          "&.Mui-selected": {
            backgroundColor: alpha(NAVY, 0.08),
            color: NAVY,
            borderColor: alpha(NAVY, 0.2),
            "&:hover": { backgroundColor: alpha(NAVY, 0.12) },
          },
        },
      },
    },
    MuiTextField:  { defaultProps: { size: "small" } },
    MuiSelect:     { defaultProps: { size: "small" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          "& fieldset": { borderColor: BORDER },
          "&:hover fieldset": { borderColor: alpha(NAVY, 0.35) },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: { root: { fontWeight: 500 } },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { height: 3, borderRadius: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          minHeight: 40,
          padding: "8px 14px",
        },
      },
    },
    MuiTable: {
      styleOverrides: { root: { borderCollapse: "separate", borderSpacing: 0 } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          "& .MuiTableCell-head": {
            backgroundColor: alpha(NAVY, 0.04),
            color: TEXT_2,
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            borderBottom: `1px solid ${BORDER}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${BORDER}` },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:last-of-type .MuiTableCell-root": { borderBottom: "none" },
          "&:hover": { backgroundColor: alpha(NAVY, 0.025) },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 16 },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: { fontWeight: 700, fontSize: "1.15rem" },
      },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 10 } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 999, height: 6 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          marginLeft: 8,
          marginRight: 8,
          marginTop: 2,
          marginBottom: 2,
          "&.Mui-selected": {
            backgroundColor: alpha(NAVY, 0.08),
            color: NAVY,
            "& .MuiListItemIcon-root": { color: NAVY },
            "&:hover": { backgroundColor: alpha(NAVY, 0.12) },
          },
        },
      },
    },
  },
});

export default theme;
