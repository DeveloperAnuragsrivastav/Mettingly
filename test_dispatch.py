import asyncio
from app.services.notifications import dispatch_pending_notifications

def run():
    print("Dispatching pending notifications...")
    res = dispatch_pending_notifications(limit=10)
    print(f"Result: {res}")

if __name__ == '__main__':
    run()
