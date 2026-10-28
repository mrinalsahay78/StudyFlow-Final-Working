import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./styles.css";
import "./components.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import ErrorBoundary from "./components/ErrorBoundary";
import AppShell from "./components/layout/AppShell";
import { Spinner } from "./components/ui/States";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Subjects from "./pages/Subjects";
import SubjectDetail from "./pages/SubjectDetail";
import Tasks from "./pages/Tasks";
import Planner from "./pages/Planner";
import Focus from "./pages/Focus";
import Quizzes from "./pages/Quizzes";
import QuizEditor from "./pages/QuizEditor";
import QuizRunner from "./pages/QuizRunner";
import Flashcards from "./pages/Flashcards";
import Notes from "./pages/Notes";
import Library from "./pages/Library";
import Assistant from "./pages/Assistant";
import Analytics from "./pages/Analytics";
import Academics from "./pages/Academics";
import Engineering from "./pages/Engineering";
import Achievements from "./pages/Achievements";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Loading…" />;
  if (user) return <Navigate to="/app" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <GuestOnly>
            <Login />
          </GuestOnly>
        }
      />
      <Route
        path="/register"
        element={
          <GuestOnly>
            <Register />
          </GuestOnly>
        }
      />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="subjects" element={<Subjects />} />
        <Route path="subjects/:id" element={<SubjectDetail />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="planner" element={<Planner />} />
        <Route path="focus" element={<Focus />} />
        <Route path="quizzes" element={<Quizzes />} />
        <Route path="quizzes/:id" element={<QuizRunner />} />
        <Route path="quizzes/:id/run" element={<QuizRunner />} />
        <Route path="quizzes/:id/edit" element={<QuizEditor />} />
        <Route path="flashcards" element={<Flashcards />} />
        <Route path="notes" element={<Notes />} />
        <Route path="library" element={<Library />} />
        <Route path="assistant" element={<Assistant />} />
        <Route path="academics" element={<Academics />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="engineering" element={<Engineering />} />
        <Route path="achievements" element={<Achievements />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
