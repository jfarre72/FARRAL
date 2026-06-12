"use client";
import {
  AppBar, Box, Toolbar, Typography, IconButton, Drawer, List, ListItemButton,
  ListItemIcon, ListItemText, Divider, Select, MenuItem, FormControl,
  InputLabel, Container, Stack, useMediaQuery, Tooltip, Chip
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import HomeIcon from "@mui/icons-material/Home";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import GroupsIcon from "@mui/icons-material/Groups";
import TimelineIcon from "@mui/icons-material/Timeline";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import ChecklistIcon from "@mui/icons-material/Checklist";
import InsightsIcon from "@mui/icons-material/Insights";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary";
import DescriptionIcon from "@mui/icons-material/Description";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@mui/material/styles";
import { logout } from "@/components/AuthGate";
import { useProjects } from "@/components/ProjectContext";

const NAV = [
  { label: "Inicio",          href: "/",            icon: <HomeIcon /> },
  { label: "Proyectos",       href: "/proyectos",   icon: <AccountBalanceIcon /> },
  { label: "Inversores",      href: "/inversores",  icon: <GroupsIcon /> },
  { label: "Hitos plan",      href: "/linea-tiempo",  icon: <TimelineIcon /> },
  { label: "Seguimiento",     href: "/temas",         icon: <ChecklistIcon /> },
  { label: "Presupuestos",    href: "/presupuestos",  icon: <RequestQuoteIcon /> },
  { label: "Caja",            href: "/caja",          icon: <PointOfSaleIcon /> },
  { label: "Económico",       href: "/economico",     icon: <AccountTreeIcon /> },
  { label: "Indicadores",     href: "/indicadores",   icon: <InsightsIcon /> },
  { label: "Galería",         href: "/galeria",       icon: <PhotoLibraryIcon /> },
  { label: "Reportería",      href: "/reporteria",    icon: <DescriptionIcon /> },
  { label: "Configuración",   href: "/configuracion", icon: <SettingsIcon /> },
];

const DRAWER_WIDTH = 240;

export default function AppShell({ children }) {
  const theme = useTheme();
  const isMd = useMediaQuery(theme.breakpoints.up("md"));
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { proyectos, proyectoId, setProyectoId, proyecto } = useProjects();

  const handleNav = (href) => {
    setOpen(false);
    router.push(href);
  };

  const drawer = (
    <Box sx={{ width: DRAWER_WIDTH, overflowX: "hidden" }} role="presentation">
      <List>
        {NAV.map((item) => (
          <ListItemButton
            key={item.href}
            selected={pathname === item.href}
            onClick={() => handleNav(item.href)}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar
        position="fixed"
        sx={{ zIndex: theme.zIndex.drawer + 1 }}
      >
        <Toolbar sx={{ gap: { xs: 1, sm: 2 }, px: { xs: 1.5, sm: 3 } }}>
          {!isMd && (
            <IconButton color="inherit" edge="start" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <Logo />
          <Box sx={{ flexGrow: 1 }} />
          <FormControl
            size="small"
            sx={{
              minWidth: { xs: 130, sm: 220 },
              maxWidth: { xs: 160, sm: "none" },
              "& .MuiOutlinedInput-root": {
                bgcolor: "rgba(255,255,255,0.08)",
                color: "white",
                "& fieldset": { borderColor: "rgba(255,255,255,0.25)" },
                "&:hover fieldset": { borderColor: "rgba(255,255,255,0.5)" },
              },
              "& .MuiInputLabel-root": { color: "rgba(255,255,255,0.7)" },
              "& .MuiSvgIcon-root": { color: "white" },
            }}
          >
            <InputLabel id="proy-sel">Proyecto</InputLabel>
            <Select
              labelId="proy-sel"
              label="Proyecto"
              value={proyectoId ?? ""}
              onChange={(e) => setProyectoId(e.target.value)}
              displayEmpty
            >
              {proyectos.length === 0 && (
                <MenuItem value="" disabled>Sin proyectos</MenuItem>
              )}
              {proyectos.map((p) => (
                <MenuItem key={p.id} value={p.id}>{p.nombre}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title="Cerrar sesión">
            <IconButton color="inherit" onClick={logout} sx={{ ml: 1 }}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {isMd ? (
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
              borderRight: "1px solid rgba(15,42,74,0.08)",
              overflowX: "hidden",
            },
          }}
          open
        >
          <Toolbar />
          {drawer}
        </Drawer>
      ) : (
        <Drawer open={open} onClose={() => setOpen(false)}>
          <Toolbar />
          {drawer}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 }, pt: { xs: 10, md: 11 }, width: "100%" }}>
        <Container maxWidth="xl" disableGutters>
          {children}
        </Container>
      </Box>
    </Box>
  );
}

function Logo() {
  return (
    <Tooltip title="FARRALAPP">
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box
          component="img" src="/logo-farral.png" alt=""
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          sx={{ height: 32, width: "auto" }}
        />
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: 0.5 }}>
          <Box component="span" sx={{ color: "#FFFFFF" }}>FARRAL</Box>
          <Box component="span" sx={{ color: "secondary.main" }}>APP</Box>
        </Typography>
      </Stack>
    </Tooltip>
  );
}
