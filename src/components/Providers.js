"use client";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v14-appRouter";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import theme from "@/theme/theme";
import { ProjectProvider } from "@/components/ProjectContext";
import AppShell from "@/components/AppShell";
import AuthGate from "@/components/AuthGate";

export default function Providers({ children }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthGate>
          <ProjectProvider>
            <AppShell>{children}</AppShell>
          </ProjectProvider>
        </AuthGate>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
