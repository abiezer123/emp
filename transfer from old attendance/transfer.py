from pymongo import MongoClient

# === OLD DATABASE (the one your app is using now) ===
old_uri = "mongodb+srv://abiezer:abiatharfam@cluster0.ghn0wj8.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"

# === NEW DATABASE (your new account’s cluster) ===
new_uri = "mongodb+srv://abiezervilla12_db_user:abiathar@cluster0.klixyhd.mongodb.net/?appName=Cluster0"

# === CONNECT TO BOTH DATABASES ===
old_client = MongoClient(old_uri)
new_client = MongoClient(new_uri)

old_db_name = "attendance_db"   # database name used in your app
new_db_name = "attendance_db"   # keep same name to make migration seamless

old_db = old_client[old_db_name]
new_db = new_client[new_db_name]

print(f"📦 Copying all collections from '{old_db_name}' to '{new_db_name}' ...")

for collection_name in old_db.list_collection_names():
    print(f"\n➡️ Copying collection: {collection_name}")
    old_collection = old_db[collection_name]
    new_collection = new_db[collection_name]

    # Read all documents
    data = list(old_collection.find())
    if not data:
        print("   ⚠️ No documents found.")
        continue

    # Clear the new collection before inserting
    new_collection.delete_many({})
    new_collection.insert_many(data)
    print(f"   ✅ Copied {len(data)} documents.")

print("\n🎉 All collections have been copied successfully!")
