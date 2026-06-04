import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Game from "@/pages/game";
import AuthPage from "@/pages/auth";
import ProfilePage from "@/pages/profile";
import PrivacyPage from "@/pages/privacy";
import SupportPage from "@/pages/support";
import TermsPage from "@/pages/terms";
import TournamentPage from "@/pages/tournament";
import CreateTournamentPage from "@/pages/create-tournament";
import { AuthProvider } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/game/:gameId" component={Game} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/profile" component={ProfilePage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/tournament/create" component={CreateTournamentPage} />
      <Route path="/tournament/:id" component={TournamentPage} />
      <Route path="/join/:inviteCode" component={TournamentPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
