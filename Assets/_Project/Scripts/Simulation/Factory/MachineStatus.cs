namespace Industria.Simulation.Factory
{
    public enum MachineStatus
    {
        Idle,
        Working,
        /// <summary>Output buffer full: production is paused.</summary>
        OutputFull,
        /// <summary>Waiting for ingredients.</summary>
        NoInput,
        /// <summary>No recipe selected.</summary>
        NoRecipe,
    }
}
