namespace Industria.Simulation.Factory
{
    /// <summary>Base class of every simulated object (machines, belts...). Has no knowledge of rendering.</summary>
    public abstract class FactoryEntity
    {
        public int Id { get; internal set; } = -1;
        public string BuildableId { get; }
        public FactorySimulation Simulation { get; internal set; }

        protected FactoryEntity(string buildableId)
        {
            BuildableId = buildableId;
        }

        public abstract void Tick(float dt);

        /// <summary>Called when another entity is removed so dangling references can be cleared.</summary>
        public virtual void ClearReferencesTo(FactoryEntity removed) { }
    }
}
