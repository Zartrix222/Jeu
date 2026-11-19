using System;
using System.Collections.Generic;

namespace Industria.Simulation.Factory
{
    /// <summary>
    /// Owns every simulated entity and advances them with a fixed time step.
    /// Completely independent from rendering and from the player position, so the factory keeps
    /// running wherever the player is.
    /// </summary>
    public sealed class FactorySimulation
    {
        public const float DefaultStep = 1f / 20f;

        private readonly List<FactoryEntity> _entities = new List<FactoryEntity>();
        private readonly Dictionary<int, FactoryEntity> _byId = new Dictionary<int, FactoryEntity>();
        private int _nextId = 1;
        private float _accumulator;

        public float Step { get; }
        public long TickCount { get; private set; }
        /// <summary>Simulated seconds since creation (or since load).</summary>
        public double SimulatedTime { get; private set; }
        public IReadOnlyList<FactoryEntity> Entities => _entities;
        /// <summary>Time accumulated but not yet simulated, in [0, Step).</summary>
        public float Accumulator => _accumulator;

        public FactorySimulation(float step = DefaultStep)
        {
            if (step <= 0f) throw new ArgumentOutOfRangeException(nameof(step));
            Step = step;
        }

        /// <summary>Adds an entity. When <paramref name="forcedId"/> is &gt; 0 it is reused (loading).</summary>
        public T Add<T>(T entity, int forcedId = -1) where T : FactoryEntity
        {
            if (entity == null) throw new ArgumentNullException(nameof(entity));
            if (entity.Simulation != null) throw new InvalidOperationException("Entity already in a simulation.");
            int id = forcedId > 0 ? forcedId : _nextId;
            if (_byId.ContainsKey(id)) throw new InvalidOperationException($"Entity id {id} already used.");
            entity.Id = id;
            entity.Simulation = this;
            _nextId = Math.Max(_nextId, id + 1);
            _entities.Add(entity);
            _byId.Add(id, entity);
            return entity;
        }

        public bool Remove(FactoryEntity entity)
        {
            if (entity == null || entity.Simulation != this) return false;
            _entities.Remove(entity);
            _byId.Remove(entity.Id);
            foreach (var e in _entities) e.ClearReferencesTo(entity);
            entity.Simulation = null;
            return true;
        }

        public FactoryEntity Get(int id) => _byId.TryGetValue(id, out var e) ? e : null;

        public void Clear()
        {
            foreach (var e in _entities) e.Simulation = null;
            _entities.Clear();
            _byId.Clear();
            _nextId = 1;
            _accumulator = 0f;
            TickCount = 0;
            SimulatedTime = 0;
        }

        /// <summary>Feeds real time; runs as many fixed steps as needed (bounded by maxSteps). Returns steps run.</summary>
        public int Advance(float deltaTime, int maxSteps = 10)
        {
            if (deltaTime > 0f) _accumulator += deltaTime;
            int steps = 0;
            while (_accumulator >= Step && steps < maxSteps)
            {
                TickOnce();
                _accumulator -= Step;
                steps++;
            }
            // Drop excess time instead of spiralling when the device is too slow.
            if (steps == maxSteps && _accumulator > Step) _accumulator = 0f;
            return steps;
        }

        public void TickOnce()
        {
            for (int i = 0; i < _entities.Count; i++) _entities[i].Tick(Step);
            TickCount++;
            SimulatedTime += Step;
        }

        /// <summary>Simulates a long period at once (e.g. catching up); runs in coarse steps for speed.</summary>
        public void Simulate(double seconds)
        {
            int count = (int)Math.Min(seconds / Step, 20 * 60 * 60);
            for (int i = 0; i < count; i++) TickOnce();
        }
    }
}
