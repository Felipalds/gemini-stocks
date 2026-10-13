import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ExpenseCategory } from "@/types";

interface CategorySelectProps {
  /** Current category name; empty string means "none". */
  value: string;
  onChange: (category: string) => void;
  categories: ExpenseCategory[];
  /** Creates a new category and returns it (so it can be selected). */
  onCreate: (name: string) => Promise<ExpenseCategory | null>;
  allowNone?: boolean;
  disabled?: boolean;
  triggerClassName?: string;
  placeholder?: string;
  id?: string;
}

/**
 * A managed category combobox used everywhere expenses pick a category. Typing
 * filters the list; no free-text entry creates stray categories. A "+ Create"
 * row (or the "+ New category…" prompt) is the only way to add one.
 */
export function CategorySelect({
  value,
  onChange,
  categories,
  onCreate,
  allowNone = true,
  disabled = false,
  triggerClassName,
  placeholder = "Category",
  id,
}: CategorySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // A modal Popover closed programmatically (e.g. after picking/creating a
  // category) can leave `pointer-events: none` stuck on <body>, freezing the
  // whole page. Clear it once the popover/prompt are closed — but only when no
  // other modal (a dialog this combobox lives inside) still needs the lock.
  useEffect(() => {
    if (open || promptOpen) return;
    const id = window.setTimeout(() => {
      if (document.body.style.pointerEvents !== "none") return;
      const modalOpen = document.querySelector(
        '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'
      );
      if (!modalOpen) document.body.style.pointerEvents = "";
    }, 0);
    return () => window.clearTimeout(id);
  }, [open, promptOpen]);

  const query = search.trim().toLowerCase();
  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(query)
  );
  // Offer creation unless the typed name already exists exactly.
  const canCreate =
    search.trim().length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === query);

  const select = (category: string) => {
    onChange(category);
    setOpen(false);
    setSearch("");
  };

  // Create directly when the user typed a name; otherwise open the prompt.
  const create = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) {
      // Close the popover first so we never stack two modal layers (which is
      // what leaves the body pointer-events lock behind).
      setOpen(false);
      setSearch("");
      setNewName("");
      setPromptOpen(true);
      return;
    }
    setCreating(true);
    try {
      const created = await onCreate(trimmed);
      if (created) select(created.name);
    } finally {
      setCreating(false);
    }
  };

  const handlePromptCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const created = await onCreate(name);
      if (created) {
        select(created.name);
        setPromptOpen(false);
        setNewName("");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Popover
        // modal so clicks register even when rendered inside a modal Dialog
        // (the import/edit dialogs disable pointer events outside their content).
        modal
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
              triggerClassName
            )}
          >
            <span className="truncate">{value || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[240px] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search or create…"
              value={search}
              onValueChange={setSearch}
            />
            <CommandList className="max-h-80">
              {filtered.length === 0 && !canCreate && (
                <CommandEmpty>No categories found.</CommandEmpty>
              )}
              <CommandGroup>
                {allowNone && !query && (
                  <CommandItem value="__none__" onSelect={() => select("")}>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value ? "opacity-0" : "opacity-100"
                      )}
                    />
                    <span className="text-muted-foreground">— None</span>
                  </CommandItem>
                )}
                {filtered.map((c) => (
                  <CommandItem
                    key={c.ID}
                    value={c.name}
                    onSelect={() => select(c.name)}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === c.name ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {c.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem
                  value="__create__"
                  disabled={creating}
                  onSelect={() => void create(search)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {canCreate ? `Create "${search.trim()}"` : "New category…"}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="new-category-name">Name</Label>
            <Input
              id="new-category-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handlePromptCreate();
                }
              }}
              placeholder="Transport"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPromptOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={creating || !newName.trim()}
              onClick={() => void handlePromptCreate()}
            >
              {creating ? "Adding..." : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
