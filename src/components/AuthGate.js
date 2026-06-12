"use client";
import { useEffect, useState } from "react";
import {
  Box, Card, CardContent, Stack, TextField, Button, Typography, Alert,
} from "@mui/material";

const USER = "admin";
const PASS = "123456";
const KEY  = "farral.auth.v1";

function isAuthed() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(KEY) === "1";
}

export default function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState(null);

  useEffect(() => {
    setAuthed(isAuthed());
    setReady(true);
  }, []);

  const submit = (e) => {
    e?.preventDefault?.();
    if (user.trim() === USER && pass === PASS) {
      window.localStorage.setItem(KEY, "1");
      setAuthed(true);
      setErr(null);
    } else {
      setErr("Usuario o contraseña incorrectos.");
    }
  };

  if (!ready) return null;

  if (!authed) {
    return (
      <Box sx={{
        minHeight: "100vh",
        display: "flex", alignItems: "center", justifyContent: "center",
        bgcolor: "background.default", p: 2,
      }}>
        <Card sx={{ width: "100%", maxWidth: 380 }}>
          <CardContent sx={{ p: 3 }}>
            <Stack spacing={2} component="form" onSubmit={submit}>
              <Box
                component="img" src="/logo-farral.png" alt="FARRAL"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                sx={{ width: "100%", maxWidth: 220, height: "auto", display: "block", mx: "auto", alignSelf: "center", mb: 1 }}
              />
              <Box>
                <Typography variant="h5" sx={{ fontWeight: 800 }}>
                  <Box component="span" sx={{ color: "primary.main" }}>FARRAL</Box>
                  <Box component="span" sx={{ color: "secondary.main" }}>APP</Box>
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Iniciá sesión para continuar.
                </Typography>
              </Box>

              {err && <Alert severity="error">{err}</Alert>}

              <TextField
                label="Usuario" fullWidth autoFocus
                value={user} onChange={(e) => setUser(e.target.value)}
              />
              <TextField
                label="Contraseña" type="password" fullWidth
                value={pass} onChange={(e) => setPass(e.target.value)}
              />

              <Button type="submit" variant="contained" color="secondary" size="large" fullWidth>
                Entrar
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return children;
}

export function logout() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.location.reload();
}
