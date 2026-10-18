"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PlayerPhoto } from "@/components/app/player-photo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import type { Player } from "@/lib/database.types";
import { squarePhoto } from "@/lib/image";
import { CLUB_TEAMS, PHOTO_BUCKET, clubTeamLabel, parsePrice, playerPhotoUrl, validatePlayer } from "@/lib/players";
import { createClient } from "@/lib/supabase/client";
import { deletePlayer, savePlayer, setPlayerPhoto } from "./actions";

type PhotoChange = { kind: "keep" } | { kind: "remove" } | { kind: "new"; blob: Blob; previewUrl: string };

export function PlayerFormDialog({
  player,
  open,
  onOpenChange,
}: {
  player: Player | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(player?.name ?? "");
  const [team, setTeam] = useState(String(player?.club_team ?? 1));
  const [price, setPrice] = useState(player ? player.price.toFixed(1) : "");
  const [active, setActive] = useState(player?.is_active ?? true);
  const [photo, setPhoto] = useState<PhotoChange>({ kind: "keep" });
  const [error, setError] = useState<string | null>(null);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photo.kind === "new") URL.revokeObjectURL(photo.previewUrl);
  }, [photo]);

  const currentPhotoUrl =
    photo.kind === "new" ? photo.previewUrl : photo.kind === "remove" ? null : playerPhotoUrl(player?.photo_path);

  async function choosePhoto(file: File | undefined) {
    if (!file) return;
    setPreparingPhoto(true);
    try {
      const blob = await squarePhoto(file);
      setPhoto({ kind: "new", blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't read that photo. Try a JPEG or PNG.");
    } finally {
      setPreparingPhoto(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function save() {
    const parsedPrice = parsePrice(price);
    const fields = { name, club_team: Number(team), price: parsedPrice ?? NaN, is_active: active };
    const problems = validatePlayer({ name, club_team: fields.club_team, price: parsedPrice });
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setError(null);

    startTransition(async () => {
      const saved = await savePlayer(player?.id ?? null, { ...fields, price: parsedPrice! });
      if (!saved.ok) {
        setError(saved.error);
        return;
      }
      const id = saved.data;

      if (photo.kind === "new") {
        const path = `${id}/${Date.now()}.jpg`;
        const { error: uploadError } = await createClient()
          .storage.from(PHOTO_BUCKET)
          .upload(path, photo.blob, { contentType: "image/jpeg", cacheControl: "31536000" });
        const linked = uploadError ? null : await setPlayerPhoto(id, path);
        if (uploadError || !linked?.ok) {
          console.error(uploadError ?? linked);
          toast.error("Player saved, but the photo didn't upload. Try again.");
          router.refresh();
          onOpenChange(false);
          return;
        }
      } else if (photo.kind === "remove" && player?.photo_path) {
        await setPlayerPhoto(id, null);
      }

      toast.success(saved.message);
      router.refresh();
      onOpenChange(false);
    });
  }

  const busy = pending || preparingPhoto;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{player ? "Edit player" : "Add player"}</DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-5"
        >
          <div className="flex items-center gap-4">
            <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted">
              <PlayerPhoto
                name={name || "?"}
                photoUrl={currentPhotoUrl}
                className={currentPhotoUrl ? "" : "w-14 text-lg"}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <Camera />
                {preparingPhoto ? "Preparing…" : currentPhotoUrl ? "Change photo" : "Add photo"}
              </Button>
              {currentPhotoUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setPhoto(player?.photo_path ? { kind: "remove" } : { kind: "keep" })}
                  disabled={busy}
                >
                  Remove
                </Button>
              )}
              <p className="w-full text-xs text-muted-foreground">Cropped to a square and compressed automatically.</p>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => choosePhoto(e.target.files?.[0])}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-name">Name</Label>
            <Input
              id="player-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoComplete="off"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Club team</Label>
            <Segmented
              name="club_team"
              value={team}
              onChange={setTeam}
              options={CLUB_TEAMS.map((t) => ({ value: String(t), label: clubTeamLabel(t) }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="player-price">Price (£m)</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground">£</span>
              <Input
                id="player-price"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="8.5"
                className="pr-10 pl-8"
                required
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-muted-foreground">m</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/60 px-4 py-3">
            <div>
              <Label htmlFor="player-active">Available</Label>
              <p className="mt-1 text-xs text-muted-foreground">Turn off if injured or not playing this term.</p>
            </div>
            <Switch id="player-active" checked={active} onCheckedChange={setActive} />
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
              {error}
            </p>
          )}

          <DialogFooter className="mt-2">
            {player && (
              <ConfirmDialog
                title={`Delete ${player.name}?`}
                description="This can't be undone. Anyone who has them in their squad loses them and picks a replacement. If they've already been in a locked team or scored this season, mark them unavailable instead, or restart the season first (Admin page)."
                confirmLabel="Delete"
                destructive
                onConfirm={async () => {
                  const result = await deletePlayer(player.id);
                  if (!result.ok) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success(result.message);
                  router.refresh();
                  onOpenChange(false);
                }}
                trigger={(openConfirm) => (
                  <Button type="button" variant="ghost" className="text-destructive sm:mr-auto" onClick={openConfirm} disabled={busy}>
                    <Trash2 />
                    Delete
                  </Button>
                )}
              />
            )}
            <Button type="submit" disabled={busy}>
              {pending ? "Saving…" : player ? "Save changes" : "Add player"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
