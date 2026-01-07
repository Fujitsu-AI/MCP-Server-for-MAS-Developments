# DATABASE LOGIC
import json
import os
import shutil
import sqlite3
from dataclasses import dataclass
from logging import Filter
from sqlite3 import Error

@dataclass
class Document:
    id: str
    content: int
    groups: str
    file: str
    user: str



def create_sql_table(db):
    try:
        import os
        if not os.path.exists(r'db'):
            os.makedirs(r'db')
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute(""" CREATE TABLE IF NOT EXISTS users (
                                            id text PRIMARY KEY,
                                            content integer NOT NULL,
                                            groups text,
                                            file text,
                                            user text
                                        ); """)
        cur.execute("SELECT name FROM sqlite_master")
        con.close()

    except Error as e:
        print(e)


def add_to_sql_table(db, id, content, groups, file, user):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        # we only store the beginning of the text in the database, for a user to see what happened.
        data = (id, content[:256], groups, file, user)
        cur.execute("INSERT or IGNORE INTO users VALUES(?, ?, ?, ?, ?)", data)
        con.commit()
        con.close()
    except Error as e:
        print("Error when Adding to DB: " + str(e))


def update_sql_table(db, id, content, groups, file, user):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        data = (content, groups, file, user, id)

        cur.execute(""" UPDATE users
                  SET content = ? ,
                      groups = ? ,
                      file = ? ,
                      user = ? ,
                  WHERE id = ?""", data)
        con.commit()
        con.close()
    except Error as e:
        print("Error Updating DB: " + str(e))


def get_from_sql_table(db, id):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute("SELECT * FROM users WHERE id=?", (id,))
        row = cur.fetchone()
        con.close()
        if row is None:
            return None
        else:
            document = Document
            document.id = row[0]
            document.content = row[1]
            document.groups = row[2]
            document.file = row[3]
            document.user = row[4]
            return document

    except Error as e:
        print("Error Getting from DB: " + str(e))


def delete_from_sql_table(db, id):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute("DELETE FROM users WHERE id=?", (id,))
        con.commit()
        con.close()
    except Error as e:
        print(e)

def clean_db(db):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute("SELECT * FROM users WHERE id IS NULL OR id = '' ")
        rows = cur.fetchall()
        for row in rows:
            print(row)
            delete_from_sql_table(db, row[0])
        con.close()
        return rows
    except Error as e:
        print(e)


def list_db(db):
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute("SELECT * FROM users ORDER BY id DESC")
        rows = cur.fetchall()
        for row in rows:
            print(row)
        con.close()
    except Error as e:
        print(e)


def get_all_db_entries(db):
    results = []
    try:
        con = sqlite3.connect(db)
        cur = con.cursor()
        cur.execute("SELECT * FROM users ORDER BY id DESC")
        rows = cur.fetchall()
        for row in rows:
            document = Document
            document.id = row[0]
            document.content = row[1]
            document.groups = row[2]
            document.file = row[3]
            document.user = row[4]
            results.append(document)
        con.close()
        return results
    except Error as e:
        print(e)
        return []


