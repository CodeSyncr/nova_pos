using System.Collections.Generic;

namespace NovaPOS.Desktop.Models;

public class MenuCategory
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public int Position { get; set; }
}

public class PosMenuItem
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal BasePrice { get; set; }
    public string CategoryId { get; set; } = "";
    public string? ImageUrl { get; set; }
}

public class CartItem
{
    public PosMenuItem Item { get; set; } = new();
    public int Quantity { get; set; }
    public decimal LineTotal => Item.BasePrice * Quantity;
}

public class OrderRecord
{
    public string Id { get; set; } = "";
    public string TableNumber { get; set; } = "-";
    public string CustomerName { get; set; } = "Walk-in";
    public decimal Total { get; set; }
    public string Status { get; set; } = "pending";
    public string CreatedAt { get; set; } = "";
}

public class TableRecord
{
    public string Id { get; set; } = "";
    public string Number { get; set; } = "";
}
