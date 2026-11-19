namespace Industria.Input
{
    /// <summary>Every discrete action of the game. Backends (keyboard, touch...) map their controls to these.</summary>
    public enum GameAction
    {
        Jump,
        Sprint,
        Interact,      // E : mine / open machine
        Primary,       // left click : mine / place
        Secondary,     // right click : cancel
        Rotate,        // R : +90° (build)
        Tilt,          // T : tilt X (structures)
        Roll,          // G : tilt Z (structures)
        ResetTilt,     // H
        BuildMode,     // B
        Deconstruct,   // X
        Inventory,     // Tab / I
        Scanner,       // C
        QuickSave,     // F5
        QuickLoad,     // F9
        Pause,         // Escape
        ToggleStats,   // F3
        Hotbar1, Hotbar2, Hotbar3, Hotbar4, Hotbar5, Hotbar6, Hotbar7, Hotbar8, Hotbar9,
        Count
    }
}
