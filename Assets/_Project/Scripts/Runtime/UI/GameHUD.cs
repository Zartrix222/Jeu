using Industria.Core;
using Industria.Factory;
using Industria.Input;
using UnityEngine;

namespace Industria.UI
{
    public enum HudPanel { None, Inventory, Machine, Pause }

    /// <summary>
    /// Owns the on-screen UI state (which panel is open), cursor locking and input blocking,
    /// and delegates drawing to small view classes. Uses IMGUI for the prototype: zero assets,
    /// resolution independent through <see cref="UIScale"/>.
    /// </summary>
    public sealed class GameHUD : MonoBehaviour
    {
        private GameRoot _root;
        private HudGameplayView _gameplay;
        private HudInventoryView _inventory;
        private HudMachineView _machine;
        private HudMenuView _menu;
        private HudTouchView _touch;
        private PerformanceOverlay _perf;

        public HudPanel Panel { get; private set; }
        public BuildingView OpenMachine { get; private set; }

        public void Init(GameRoot root)
        {
            _root = root;
            _gameplay = new HudGameplayView(root);
            _inventory = new HudInventoryView(root);
            _machine = new HudMachineView(root);
            _menu = new HudMenuView(root);
            _touch = new HudTouchView(root);
            _perf = new PerformanceOverlay(root);
        }

        public void OpenMachinePanel(BuildingView building)
        {
            OpenMachine = building;
            Panel = HudPanel.Machine;
        }

        public void Open(HudPanel panel)
        {
            Panel = panel;
            if (panel != HudPanel.Machine) OpenMachine = null;
        }

        public void CloseAll() => Open(HudPanel.None);

        private void Update()
        {
            if (_root == null) return;
            var input = _root.Input;
            _perf.Tick();
            if (input.Pressed(GameAction.ToggleStats)) _perf.Visible = !_perf.Visible;

            if (_root.State == GameState.Playing || _root.State == GameState.Paused)
            {
                if (input.Pressed(GameAction.Pause))
                {
                    if (Panel != HudPanel.None && Panel != HudPanel.Pause) CloseAll();
                    else if (_root.Build.IsActive) _root.Build.Exit();
                    else if (Panel == HudPanel.Pause) CloseAll();
                    else Open(HudPanel.Pause);
                }
                else if (input.Pressed(GameAction.Inventory))
                {
                    Open(Panel == HudPanel.Inventory ? HudPanel.None : HudPanel.Inventory);
                }
                if (Panel == HudPanel.Machine && OpenMachine == null) CloseAll();
                _root.SetPaused(Panel == HudPanel.Pause);
            }
            else
            {
                Panel = HudPanel.None;
            }

            bool uiOpen = Panel != HudPanel.None || _root.State != GameState.Playing;
            input.GameplayBlocked = uiOpen;
            bool touch = input.Touch.Enabled;
            Cursor.lockState = uiOpen || touch ? CursorLockMode.None : CursorLockMode.Locked;
            Cursor.visible = uiOpen || touch;
        }

        private void OnGUI()
        {
            if (_root == null) return;
            UIStyles.Ensure();
            GUI.matrix = UIScale.GuiMatrix;

            if (_root.State == GameState.MainMenu)
            {
                _menu.DrawMainMenu();
                return;
            }

            _gameplay.Draw(Panel == HudPanel.None);
            _perf.Draw(UIScale.Width);
            if (_root.Input.Touch.Enabled && Panel == HudPanel.None) _touch.Draw();

            switch (Panel)
            {
                case HudPanel.Inventory: _inventory.Draw(); break;
                case HudPanel.Machine: _machine.Draw(OpenMachine); break;
                case HudPanel.Pause: _menu.DrawPause(); break;
            }
        }
    }
}
