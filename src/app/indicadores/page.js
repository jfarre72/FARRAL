"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LinearProgress } from "@mui/material";

// Indicadores se fusionó con Inicio: redirigimos a la home.
export default function IndicadoresRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return <LinearProgress />;
}
