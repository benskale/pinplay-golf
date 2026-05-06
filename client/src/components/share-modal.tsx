import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, MessageCircle, MessageSquare, X } from "lucide-react";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  isCompleted?: boolean;
}

export function ShareModal({ isOpen, onClose, gameId, isCompleted }: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const gameUrl = `${window.location.origin}/game/${gameId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(gameUrl);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Game link has been copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = gameUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Game link has been copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    const text = isCompleted
      ? encodeURIComponent(`Check out our round! See the final scores: ${gameUrl}`)
      : encodeURIComponent(`Join our Wolf game! Click here to track scores: ${gameUrl}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleSMSShare = () => {
    const text = isCompleted
      ? encodeURIComponent(`Check out our round! See the final scores: ${gameUrl}`)
      : encodeURIComponent(`Join our Wolf game! Click here to track scores: ${gameUrl}`);
    window.open(`sms:?body=${text}`, '_blank');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-sm w-full" data-testid="modal-share">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0">
          <DialogTitle data-testid="text-share-title">Share Game</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="button-close-modal"
          >
            <X className="w-4 h-4" />
          </Button>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
            <p className="text-sm text-green-700 dark:text-green-300" data-testid="text-sharing-info">
              {isCompleted
                ? <>📱 <strong>Share the results!</strong> Others can view the final scorecard and claim the round to their profile.</>
                : <>📱 <strong>Share with your golf group!</strong> Others can track live scores and see who's winning in real-time. Only you can enter points.</>
              }
            </p>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2" data-testid="text-game-link-label">
              Game Link
            </label>
            <div className="flex">
              <Input
                type="text"
                value={gameUrl}
                readOnly
                className="flex-1 rounded-r-none bg-gray-50 dark:bg-gray-800 text-sm"
                data-testid="input-game-url"
              />
              <Button
                onClick={handleCopyLink}
                className="rounded-l-none bg-primary-700 hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700"
                data-testid="button-copy-link"
              >
                {copied ? (
                  <span className="text-sm">✓</span>
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={handleWhatsAppShare}
              className="bg-green-500 hover:bg-green-600 text-white"
              data-testid="button-share-whatsapp"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              WhatsApp
            </Button>
            <Button
              onClick={handleSMSShare}
              className="bg-blue-500 hover:bg-blue-600 text-white"
              data-testid="button-share-sms"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Text
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
