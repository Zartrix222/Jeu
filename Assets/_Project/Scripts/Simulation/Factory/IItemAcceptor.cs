namespace Industria.Simulation.Factory
{
    /// <summary>Anything that can receive items pushed by a machine or a belt.</summary>
    public interface IItemAcceptor
    {
        bool CanInsert(string itemId);
        bool TryInsert(string itemId);
    }
}
