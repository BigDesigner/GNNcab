import React, { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { useLogin } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Input, Button, Label } from "@/components/ui";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.user, data.token);
        if (data.user.role === "admin") setLocation("/admin");
        else if (data.user.role === "driver") setLocation("/driver");
        else setLocation("/customer");
        
        toast({ title: "Welcome back!", description: `Logged in as ${data.user.firstName}` });
      },
      onError: (error: any) => {
        toast({ 
          title: "Login failed", 
          description: error?.message || "Invalid credentials", 
          variant: "destructive" 
        });
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background">
      {/* Background Image */}
      <div 
        className="absolute inset-0 z-0 opacity-40 mix-blend-screen"
        style={{
          backgroundImage: `url(${import.meta.env.BASE_URL}images/login-bg.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Gradient overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-transparent" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="z-10 w-full max-w-md px-4"
      >
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="Logo" className="h-16 w-16 mx-auto mb-4" />
          <h1 className="text-4xl font-display font-bold tracking-tight text-white mb-2">GNNcab Platform</h1>
          <p className="text-muted-foreground">Sign in to your account</p>
        </div>

        <Card className="border-border/50 bg-card/60 backdrop-blur-xl shadow-2xl">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="admin@gnncab.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input 
                  id="password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required 
                />
              </div>
              <Button 
                type="submit" 
                className="w-full mt-6" 
                size="lg"
                isLoading={loginMutation.isPending}
              >
                Sign In
              </Button>
              
              <div className="text-center text-sm text-muted-foreground pt-4">
                Demo accounts: <br/>
                admin@gnncab.com | driver@gnncab.com | cust@gnncab.com
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
