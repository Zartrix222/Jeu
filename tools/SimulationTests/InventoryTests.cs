using System.Collections.Generic;
using Industria.Simulation.Items;
using NUnit.Framework;

namespace Industria.Tests
{
    public class InventoryTests
    {
        private ItemRegistry _registry;

        [SetUp]
        public void SetUp()
        {
            _registry = new ItemRegistry();
            _registry.Register(new ItemDefinition { id = "a", maxStack = 10 });
            _registry.Register(new ItemDefinition { id = "b", maxStack = 5 });
        }

        [Test]
        public void AddStacksAndReturnsOverflow()
        {
            var inv = new Inventory(2, _registry);
            Assert.That(inv.Add("a", 15), Is.EqualTo(0));
            Assert.That(inv.Count("a"), Is.EqualTo(15));
            Assert.That(inv.Add("a", 10), Is.EqualTo(5));
            Assert.That(inv.Count("a"), Is.EqualTo(20));
            Assert.That(inv.CanAdd("b", 1), Is.False);
        }

        [Test]
        public void RemoveAcrossSlots()
        {
            var inv = new Inventory(3, _registry);
            inv.Add("a", 25);
            Assert.That(inv.Remove("a", 12), Is.EqualTo(12));
            Assert.That(inv.Count("a"), Is.EqualTo(13));
            Assert.That(inv.Remove("a", 100), Is.EqualTo(13));
            Assert.That(inv.Count("a"), Is.EqualTo(0));
            Assert.That(inv.SpaceFor("b"), Is.EqualTo(15));
        }

        [Test]
        public void TryRemoveAllIsAtomic()
        {
            var inv = new Inventory(4, _registry);
            inv.Add("a", 5);
            inv.Add("b", 1);
            var cost = new List<ItemStack> { new ItemStack("a", 3), new ItemStack("b", 2) };
            Assert.That(inv.TryRemoveAll(cost), Is.False);
            Assert.That(inv.Count("a"), Is.EqualTo(5));
            inv.Add("b", 1);
            Assert.That(inv.TryRemoveAll(cost), Is.True);
            Assert.That(inv.Count("a"), Is.EqualTo(2));
            Assert.That(inv.Count("b"), Is.EqualTo(0));
        }

        [Test]
        public void DuplicateCostEntriesAreAggregated()
        {
            var inv = new Inventory(4, _registry);
            inv.Add("a", 3);
            var cost = new List<ItemStack> { new ItemStack("a", 2), new ItemStack("a", 2) };
            Assert.That(inv.HasAll(cost), Is.False);
        }

        [Test]
        public void ChangedEventFiresOnlyOnRealChanges()
        {
            var inv = new Inventory(1, _registry);
            int changes = 0;
            inv.Changed += () => changes++;
            inv.Add("a", 10);
            inv.Add("a", 1);      // does not fit
            inv.Remove("b", 1);   // nothing to remove
            Assert.That(changes, Is.EqualTo(1));
        }

        [Test]
        public void LoadSkipsUnknownItems()
        {
            var inv = new Inventory(4, _registry);
            inv.Load(new[] { new ItemStack("a", 4), new ItemStack("zzz", 3), new ItemStack("b", 7) });
            Assert.That(inv.Count("a"), Is.EqualTo(4));
            Assert.That(inv.Count("b"), Is.EqualTo(7));
            Assert.That(inv.ToList().Count, Is.EqualTo(3)); // b split into 5 + 2
        }
    }
}
