"use client";
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [proyectos, setProyectos] = useState([]);
  const [proyectoId, setProyectoId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError("Supabase no está configurado. Definí NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("proyectos")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) setError(error.message);
    else {
      setProyectos(data ?? []);
      setError(null);
      if (!proyectoId && data && data.length > 0) {
        const stored = typeof window !== "undefined" ? window.localStorage.getItem("farral.proyectoId") : null;
        const valid = stored && data.some((p) => p.id === stored);
        setProyectoId(valid ? stored : data[0].id);
      }
    }
    setLoading(false);
  }, [proyectoId]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (proyectoId && typeof window !== "undefined") {
      window.localStorage.setItem("farral.proyectoId", proyectoId);
    }
  }, [proyectoId]);

  const proyecto = proyectos.find((p) => p.id === proyectoId) ?? null;

  return (
    <ProjectContext.Provider
      value={{ proyectos, proyectoId, setProyectoId, proyecto, loading, error, refresh }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProjects fuera de ProjectProvider");
  return ctx;
}
