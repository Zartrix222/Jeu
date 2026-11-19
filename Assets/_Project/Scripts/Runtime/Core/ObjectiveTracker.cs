using System;
using System.Collections.Generic;
using Industria.Factory;
using Industria.Simulation.Factory;

namespace Industria.Core
{
    /// <summary>First-era guided objectives: teaches the core loop mine -> smelt -> automate.</summary>
    public sealed class ObjectiveTracker
    {
        public sealed class Objective
        {
            public string Id;
            public string Title;
            public string Hint;
            public Func<GameRoot, bool> IsDone;
        }

        private readonly List<Objective> _objectives = new List<Objective>();
        private readonly HashSet<string> _completed = new HashSet<string>();
        private float _nextCheck;

        public IReadOnlyList<Objective> All => _objectives;
        public bool IsCompleted(string id) => _completed.Contains(id);

        public Objective Current
        {
            get
            {
                foreach (var o in _objectives) if (!_completed.Contains(o.Id)) return o;
                return null;
            }
        }

        public int CompletedCount => _completed.Count;

        public ObjectiveTracker()
        {
            Add("scan", "Utiliser le scanner", "Appuyez sur [C] pour révéler les gisements proches.", r => r.Scanner.Markers.Count > 0);
            Add("mine", "Miner 12 minerais de fer et 6 de cuivre", "Visez un gisement et maintenez [E] ou le clic gauche.",
                r => r.PlayerInventory.Count("ore_iron") >= 12 && r.PlayerInventory.Count("ore_copper") >= 6 || HasBuilding(r, "smelter_mk1"));
            Add("smelter", "Construire une fonderie", "[1] pour la sélectionner, clic gauche pour la placer.", r => HasBuilding(r, "smelter_mk1"));
            Add("ingots", "Produire 8 lingots de fer et 4 de cuivre", "Ouvrez la fonderie avec [E] et déposez votre minerai.",
                r => r.PlayerInventory.Count("ingot_iron") >= 8 && r.PlayerInventory.Count("ingot_copper") >= 4 || HasBuilding(r, "drill_mk1"));
            Add("drill", "Placer une foreuse sur un gisement", "[2] pour la sélectionner, visez un gisement.", r => HasBuilding(r, "drill_mk1"));
            Add("belt", "Relier la foreuse à la fonderie par convoyeur", "[3] : cliquez sur la sortie orange puis sur l'entrée bleue.", HasAutomatedChain);
            Add("foundation", "Poser une fondation", "[4] : les fondations s'alignent entre elles.", r => HasBuilding(r, "foundation_4m"));
        }

        private void Add(string id, string title, string hint, Func<GameRoot, bool> done)
            => _objectives.Add(new Objective { Id = id, Title = title, Hint = hint, IsDone = done });

        public void Update(GameRoot root, float time)
        {
            if (time < _nextCheck) return;
            _nextCheck = time + 0.5f;
            var current = Current;
            if (current == null) return;
            if (current.IsDone(root))
            {
                _completed.Add(current.Id);
                root.Notifications.Push($"Objectif accompli : {current.Title}", NotificationKind.Success, 5f);
                if (Current == null) root.Notifications.Push("Ère Survie terminée ! L'ère Mécanique arrive dans la prochaine version.", NotificationKind.Success, 8f);
            }
        }

        public List<string> Save() => new List<string>(_completed);

        public void Load(IEnumerable<string> completed)
        {
            _completed.Clear();
            if (completed != null) foreach (var id in completed) _completed.Add(id);
        }

        private static bool HasBuilding(GameRoot r, string id)
        {
            foreach (var b in r.Factory.Buildings) if (b.Definition.id == id) return true;
            return false;
        }

        /// <summary>True when an extractor feeds a processor through one or more belts.</summary>
        private static bool HasAutomatedChain(GameRoot r)
        {
            foreach (var b in r.Factory.Buildings)
            {
                if (!(b.Machine is ExtractorMachine)) continue;
                foreach (var port in b.Ports)
                {
                    var belt = port.Belt;
                    int guard = 0;
                    while (belt != null && guard++ < 64)
                    {
                        if (belt.TargetPort != null && belt.TargetPort.Owner.Machine is ProcessorMachine) return true;
                        belt = belt.TargetBelt;
                    }
                }
            }
            return false;
        }
    }
}
