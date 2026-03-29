import React, { createContext, useContext, useState, useEffect } from "react";
import { UserProfile } from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (user: UserProfile, token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("gnncab_token");
    const storedUser = localStorage.getItem("gnncab_user");
    
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch (e) {
        localStorage.removeItem("gnncab_token");
        localStorage.removeItem("gnncab_user");
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newUser: UserProfile, newToken: string) => {
    setUser(newUser);
    setToken(newToken);
    localStorage.setItem("gnncab_user", JSON.stringify(newUser));
    localStorage.setItem("gnncab_token", newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("gnncab_user");
    localStorage.removeItem("gnncab_token");
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
