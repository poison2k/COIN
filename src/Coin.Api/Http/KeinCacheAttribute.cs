using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Net.Http.Headers;

namespace Coin.Api.Http;

/// <summary>Setzt <c>Cache-Control: no-store</c> auf jede Antwort der Aktion (Personendaten, AK-11, AK-14).</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class KeinCacheAttribute : ResultFilterAttribute
{
    public override void OnResultExecuting(ResultExecutingContext context)
    {
        context.HttpContext.Response.Headers[HeaderNames.CacheControl] = "no-store";
    }
}
