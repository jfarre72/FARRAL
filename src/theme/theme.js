"use client";
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary:   { main: "#0F2A4A" },   // FARRAL (azul oscuro)
    secondary: { main: "#E07A1F" },   // APP    (naranja)
    background: { default: "#F5F6F8", paper: "#FFFFFF" },
    success: { main: "#1E8E3E" },
    warning: { main: "#E0A21F" },
    error:   { main: "#C0392B" },
    text:    { primary: "#1A1F2B", secondary: "#5C6470" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily:
      '"Inter","Roboto","Helvetica","Arial",sans-serif',
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "#0F2A4A",
          color: "#fff",
          boxShadow: "0 1px 0 rgba(0,0,0,0.06)",
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          boxShadow: "0 1px 2px rgba(15,42,74,0.06), 0 4px 16px rgba(15,42,74,0.05)",
          border: "1px solid rgba(15,42,74,0.06)",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiSelect:    { defaultProps: { size: "small" } },
  },
});

export default theme;
